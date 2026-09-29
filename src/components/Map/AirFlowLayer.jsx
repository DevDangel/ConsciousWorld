import { useEffect, useRef, useState } from 'react';
import { AIR_FLOW, airFlowBucket } from '../../data/constants';
import { bilinear, windAt, compassPoint } from '../../utils/airField';
import styles from './MapView.module.css';

const DEG = Math.PI / 180;

/**
 * Air quality in motion: thousands of particles carried by the real wind field,
 * each tinted by the PM2.5 of the air it is travelling through.
 *
 * It is a plain 2D canvas laid over the MapLibre canvas, not a map layer, so
 * it never interferes with hover, click or layer ordering (pointer-events are
 * off). Positions live in lng/lat and are projected with `map.project` every
 * frame, which is what makes them follow the globe.
 *
 * Why it looks like streams and not dots — and why it stays clean:
 *  - every particle remembers its last few positions (one every
 *    `trailEvery` frames) and draws them as a tail that fades from solid at the
 *    head to transparent at the end;
 *  - the canvas is cleared completely every frame. The usual trick of fading
 *    the previous frame (`destination-in`) never reaches zero: 8-bit rounding
 *    leaves every old trail stuck at ~5 % opacity forever (measured: 14/255
 *    after 100, 300 and 600 frames), and within a minute those ghosts cover
 *    the globe in grey scratches that drown the continents;
 *  - each particle lives 80–180 frames and drifts ~0,5 px per frame per
 *    10 m/s (see AIR_FLOW in constants.js);
 *  - in near-calm air (< `calmSpeed`) particles are not drawn, so windless
 *    regions read as still instead of as jittery squiggles;
 *  - particles are born on random *screen* pixels that land on the globe, so
 *    they are spread evenly across what you see instead of piling up on the
 *    horizon where the sphere is foreshortened.
 * While the camera moves the canvas is hidden and cleared; trails drawn in the
 * old camera position would otherwise smear across the screen.
 */
export default function AirFlowLayer({ map, airFlow, visible }) {
  const canvasRef = useRef(null);
  const [readout, setReadout] = useState(null);

  // ——— Particle engine ———
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!map || !airFlow || !visible || !canvas) return undefined;

    const { field } = airFlow;
    const pm = airFlow.pollution.values;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const nBuckets = AIR_FLOW.buckets.length;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let capacity = 0;
    let target = 0; // particles wanted for this view
    let count = 0; // particles actually animated (≤ target, see adapt())
    let frameCost = 0; // smoothed ms of JS per frame
    let frameNo = 0;
    let lng, lat, age, maxAge, sx, sy, load;
    // Tail: a ring of the last T screen positions per particle.
    const T = AIR_FLOW.trailPoints;
    const LEVELS = AIR_FLOW.trailAlpha.length;
    let hx, hy, hLen, hHead;
    // Per-frame draw state: colour bucket, visibility, particles sorted by bucket.
    let bucketOf, shown, order;
    const bucketStart = new Int32Array(nBuckets + 1);

    let raf = null;
    let moving = false;
    let paused = document.hidden;
    // Cosine of the widest angle from the view centre at which a particle is
    // still on screen. Measured from real spawns, so it tracks both the globe
    // horizon and the screen edges without relying on MapLibre internals.
    let cullCos = -1;
    let cLng = 0, sinCLat = 0, cosCLat = 1;
    let pxPerDeg = 1;

    function readCamera() {
      const c = map.getCenter();
      cLng = c.lng * DEG;
      sinCLat = Math.sin(c.lat * DEG);
      cosCLat = Math.cos(c.lat * DEG);
      // Degrees → screen pixels at the view centre (512 px world tiles).
      pxPerDeg = (512 * 2 ** map.getZoom()) / 360;
    }

    function angularCos(lo, la) {
      const l = la * DEG;
      return sinCLat * Math.sin(l) + cosCLat * Math.cos(l) * Math.cos(lo * DEG - cLng);
    }

    function allocate() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Buffers sized for the worst case; how many are live is decided in
      // respawnAll, from how much of the screen the planet covers.
      capacity = Math.min(
        AIR_FLOW.maxParticles,
        Math.round(width * height * AIR_FLOW.density * (reduced ? 0.35 : 1))
      );
      const n = capacity;
      lng = new Float32Array(n);
      lat = new Float32Array(n);
      age = new Float32Array(n);
      maxAge = new Float32Array(n);
      sx = new Float32Array(n);
      sy = new Float32Array(n);
      load = new Float32Array(n);
      hx = new Float32Array(n * T);
      hy = new Float32Array(n * T);
      hLen = new Uint8Array(n);
      hHead = new Uint8Array(n);
      bucketOf = new Uint8Array(n);
      shown = new Uint8Array(n);
      order = new Int32Array(n);
    }

    /**
     * Drop particle i on a random screen pixel that lies on the planet. The
     * round trip (unproject → project) rejects pixels out in space, where
     * unproject clamps to the horizon instead of failing.
     */
    function spawn(i) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const ll = map.unproject([x, y]);
        const back = map.project(ll);
        if (Math.abs(back.x - x) > 1 || Math.abs(back.y - y) > 1) continue;
        if (Math.abs(ll.lat) > 84) continue;
        lng[i] = ll.lng;
        lat[i] = ll.lat;
        sx[i] = x;
        sy[i] = y;
        hx[i * T] = x;
        hy[i * T] = y;
        hLen[i] = 1;
        hHead[i] = 1 % T;
        shown[i] = 0;
        age[i] = 0;
        maxAge[i] = AIR_FLOW.minAge + Math.random() * (AIR_FLOW.maxAge - AIR_FLOW.minAge);
        load[i] = bilinear(field, pm, ll.lng, ll.lat);
        return true;
      }
      // Nothing of the planet under the sampled pixels; try again next frame.
      age[i] = maxAge[i] = 0;
      hLen[i] = 0;
      shown[i] = 0;
      return false;
    }

    /** Share of the screen that shows planet rather than space. */
    function planetCoverage() {
      let hits = 0;
      const samples = 160;
      for (let s = 0; s < samples; s++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const back = map.project(map.unproject([x, y]));
        if (Math.abs(back.x - x) <= 1 && Math.abs(back.y - y) <= 1) hits++;
      }
      return hits / samples;
    }

    function respawnAll() {
      readCamera();
      // Same density on the planet whether it fills the screen or floats
      // small in the middle of it.
      target = Math.round(capacity * Math.max(planetCoverage(), 0.05));
      count = count ? Math.min(count, target) : target;
      let minCos = 1;
      for (let i = 0; i < count; i++) {
        if (spawn(i)) {
          const c = angularCos(lng[i], lat[i]);
          if (c < minCos) minCos = c;
          // Stagger the first generation so they do not all die together.
          age[i] = Math.random() * maxAge[i];
        }
      }
      cullCos = minCos - 0.02;
    }

    /**
     * Keep the frame cheap on modest hardware: if the particle step costs more
     * than ~10 ms, animate fewer; if it is comfortably fast, grow back towards
     * the target. A slow laptop gets a sparser wind instead of a stutter.
     */
    function adapt(cost) {
      frameCost = frameCost ? frameCost * 0.9 + cost * 0.1 : cost;
      if (++frameNo % 30) return;
      if (frameCost > 10 && count > 600) {
        count = Math.floor(count * 0.85);
      } else if (frameCost < 7 && count < target) {
        const grown = Math.min(target, Math.ceil(count * 1.1) + 10);
        for (let i = count; i < grown; i++) spawn(i);
        count = grown;
      }
    }

    /** k-th stored point of particle i, oldest first; k === n is the head. */
    function pointX(i, k, n) {
      return k === n ? sx[i] : hx[i * T + ((hHead[i] - n + k + 2 * T) % T)];
    }
    function pointY(i, k, n) {
      return k === n ? sy[i] : hy[i * T + ((hHead[i] - n + k + 2 * T) % T)];
    }

    function step() {
      const k = AIR_FLOW.speed / pxPerDeg;
      const calm = AIR_FLOW.calmSpeed;
      for (let i = 0; i < count; i++) {
        if (++age[i] > maxAge[i]) {
          spawn(i);
          continue;
        }
        const lo = lng[i];
        const la = lat[i];
        const u = bilinear(field, field.u, lo, la);
        const v = bilinear(field, field.v, lo, la);
        const nLng = lo + (u * k) / Math.max(Math.cos(la * DEG), 0.1);
        const nLat = la + v * k;

        if (nLat > 84 || nLat < -84 || angularCos(nLng, nLat) < cullCos) {
          spawn(i);
          continue;
        }
        const p = map.project([nLng, nLat]);
        if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) {
          spawn(i);
          continue;
        }

        // Air keeps some of the pollution it picked up, so a plume stays
        // coloured for a moment after the particle leaves the source.
        const here = bilinear(field, pm, nLng, nLat);
        const carried = load[i] * 0.985;
        load[i] = here > carried ? here : carried;
        bucketOf[i] = airFlowBucket(load[i]);
        shown[i] = u * u + v * v >= calm * calm ? 1 : 0;

        lng[i] = nLng;
        lat[i] = nLat;
        sx[i] = p.x;
        sy[i] = p.y;
        // Every few frames the head becomes a permanent point of the tail.
        if ((age[i] | 0) % AIR_FLOW.trailEvery === 0) {
          const h = hHead[i];
          hx[i * T + h] = p.x;
          hy[i * T + h] = p.y;
          hHead[i] = (h + 1) % T;
          if (hLen[i] < T) hLen[i]++;
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Counting sort by colour, so each colour is one pass over its particles.
      bucketStart.fill(0);
      for (let i = 0; i < count; i++) if (shown[i]) bucketStart[bucketOf[i] + 1]++;
      for (let b = 0; b < nBuckets; b++) bucketStart[b + 1] += bucketStart[b];
      const fill = bucketStart.slice(0, nBuckets);
      for (let i = 0; i < count; i++) if (shown[i]) order[fill[bucketOf[i]]++] = i;

      ctx.lineWidth = AIR_FLOW.lineWidth;
      ctx.lineCap = 'round';
      for (let b = 0; b < nBuckets; b++) {
        const from = bucketStart[b];
        const to = bucketStart[b + 1];
        if (from === to) continue;
        ctx.strokeStyle = AIR_FLOW.buckets[b].color;
        // One stroke per fade level. A segment's level depends on how far
        // it is from the head, so every tail fades the same way.
        for (let l = 0; l < LEVELS; l++) {
          const dLo = Math.ceil(((LEVELS - 1 - l) * T) / LEVELS);
          const dHi = Math.ceil(((LEVELS - l) * T) / LEVELS);
          ctx.globalAlpha = AIR_FLOW.trailAlpha[l];
          ctx.beginPath();
          for (let o = from; o < to; o++) {
            const i = order[o];
            const n = hLen[i];
            // Segment s joins point s to point s + 1; distance from head = n - 1 - s.
            const sHi = Math.min(n - 1, n - 1 - dLo);
            const sLo = Math.max(0, n - dHi);
            for (let seg = sLo; seg <= sHi; seg++) {
              ctx.moveTo(pointX(i, seg, n), pointY(i, seg, n));
              ctx.lineTo(pointX(i, seg + 1, n), pointY(i, seg + 1, n));
            }
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      if (moving || paused) return;
      const started = performance.now();
      step();
      draw();
      adapt(performance.now() - started);
    }

    function onMoveStart() {
      moving = true;
      ctx.clearRect(0, 0, width, height);
    }
    function onMoveEnd() {
      moving = false;
      ctx.clearRect(0, 0, width, height);
      respawnAll();
    }
    function onResize() {
      allocate();
      respawnAll();
    }
    function onVisibility() {
      paused = document.hidden;
    }

    allocate();
    respawnAll();
    raf = requestAnimationFrame(frame);

    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [map, airFlow, visible]);

  // ——— Readout under the cursor (wind + PM2.5), nullschool-style ———
  useEffect(() => {
    if (!map || !airFlow || !visible) {
      setReadout(null);
      return undefined;
    }
    const { field, pollution } = airFlow;
    let frame = null;
    let pending = null;

    function flush() {
      frame = null;
      const e = pending;
      pending = null;
      if (!e) return;
      const { lng, lat } = e.lngLat;
      const back = map.project(e.lngLat);
      if (Math.abs(back.x - e.point.x) > 2 || Math.abs(back.y - e.point.y) > 2) {
        setReadout(null); // cursor is out in space
        return;
      }
      const w = windAt(field, lng, lat);
      setReadout({
        lat,
        lng,
        speed: w.speed,
        from: compassPoint(w.from),
        pm: bilinear(field, pollution.values, lng, lat),
      });
    }
    function onMove(e) {
      pending = e;
      frame ??= requestAnimationFrame(flush);
    }
    function onOut() {
      setReadout(null);
    }
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
    };
  }, [map, airFlow, visible]);

  if (!airFlow) return null;

  const fmt = (n, d = 1) => n.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
  const isStations = airFlow.pollution.source === 'stations';

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.airFlowCanvas}
        style={{ opacity: visible ? 1 : 0 }}
        aria-hidden="true"
      />
      {visible && readout && (
        <div className={styles.airReadout}>
          <span className={styles.airReadoutCoord}>
            {fmt(Math.abs(readout.lat))}°{readout.lat >= 0 ? 'N' : 'S'}{' '}
            {fmt(Math.abs(readout.lng))}°{readout.lng >= 0 ? 'E' : 'O'}
          </span>
          <span>
            Viento <b>{fmt(readout.speed)} m/s</b> del {readout.from}
            <i> · {fmt(readout.speed * 3.6, 0)} km/h</i>
          </span>
          <span>
            PM2.5 <b>{isStations ? '≈ ' : ''}{fmt(readout.pm, 0)} µg/m³</b>
          </span>
        </div>
      )}
    </>
  );
}
