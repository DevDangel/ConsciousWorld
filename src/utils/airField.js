/* ============================================
   ConsciousWorld — Air flow field
   ============================================
   Pure data helpers for the "Aire en movimiento" layer: a global wind grid
   (U/V in m/s) plus a PM2.5 grid on the same cells. No DOM, no MapLibre —
   everything here can run in a worker or a test.
*/

const DEG = Math.PI / 180;

/**
 * Normalise `public/data/air-field.json` into typed arrays.
 *
 * The grid is regular in lat/lng, row-major from north to south, and spans the
 * full 360° of longitude, so sampling wraps east-west. Both the bundled GFS
 * sample (lo1 = 0) and the Open-Meteo script output (lo1 = -180) fit this.
 */
export function createField(json, { smoothPasses = 0 } = {}) {
  const { lo1, la1, dx, dy, nx, ny } = json ?? {};
  const cells = nx * ny;
  if (![lo1, la1, dx, dy, nx, ny].every(Number.isFinite) || !cells) {
    throw new Error('air-field.json: cabecera de cuadrícula incompleta');
  }
  if (json.u?.length !== cells || json.v?.length !== cells) {
    throw new Error(`air-field.json: se esperaban ${cells} valores de u y v`);
  }
  const u = Float32Array.from(json.u);
  const v = Float32Array.from(json.v);
  for (let p = 0; p < smoothPasses; p++) {
    blur121(u, nx, ny);
    blur121(v, nx, ny);
  }
  return {
    lo1, la1, dx, dy, nx, ny,
    u,
    v,
    // Gridded PM2.5 is only present once `npm run data:air` has run.
    pm: json.pm?.length === cells ? Float32Array.from(json.pm) : null,
    meta: json._meta ?? null,
  };
}

/**
 * One pass of a [1 2 1] blur, east-west (wrapping) then north-south. Removes
 * cell-to-cell eddies while leaving anything wider than ~3 cells intact.
 */
function blur121(arr, nx, ny) {
  const tmp = new Float32Array(arr.length);
  for (let j = 0; j < ny; j++) {
    const r = j * nx;
    for (let i = 0; i < nx; i++) {
      const w = i === 0 ? nx - 1 : i - 1;
      const e = i === nx - 1 ? 0 : i + 1;
      tmp[r + i] = (arr[r + w] + 2 * arr[r + i] + arr[r + e]) / 4;
    }
  }
  for (let j = 0; j < ny; j++) {
    const n = j === 0 ? 0 : j - 1;
    const sI = j === ny - 1 ? ny - 1 : j + 1;
    for (let i = 0; i < nx; i++) {
      arr[j * nx + i] = (tmp[n * nx + i] + 2 * tmp[j * nx + i] + tmp[sI * nx + i]) / 4;
    }
  }
}

/** Bilinear interpolation of any per-cell array of the field. */
export function bilinear(f, arr, lng, lat) {
  let x = (lng - f.lo1) / f.dx;
  x %= f.nx;
  if (x < 0) x += f.nx;
  let y = (f.la1 - lat) / f.dy;
  if (y < 0) y = 0;
  else if (y > f.ny - 1) y = f.ny - 1;

  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 === f.nx ? 0 : x0 + 1;
  const y1 = y0 + 1 < f.ny ? y0 + 1 : y0;
  const fx = x - x0;
  const fy = y - y0;
  const r0 = y0 * f.nx;
  const r1 = y1 * f.nx;
  return (arr[r0 + x0] * (1 - fx) + arr[r0 + x1] * fx) * (1 - fy)
    + (arr[r1 + x0] * (1 - fx) + arr[r1 + x1] * fx) * fy;
}

/**
 * Where the PM2.5 painted on the particles comes from.
 *
 * - With a real PM2.5 grid (Open-Meteo / CAMS, via `npm run data:air`) it is
 *   used as-is: CAMS already models how pollution is transported.
 * - Without one, the 67 measured points are released into the wind field and
 *   advected downwind (`disperse`). That is an illustrative tracer, not an air
 *   quality model, and the legend says so.
 */
export function buildPollution(field, airQuality) {
  if (field.pm) return { values: field.pm, source: 'grid' };
  const sources = splatStations(field, airQuality ?? []);
  return { values: disperse(field, sources), source: 'stations' };
}

/**
 * Stamp every measurement onto the grid as a soft blob. Country figures are
 * national averages, so they spread wider than a single city reading.
 * Overlapping blobs keep the maximum: two nearby readings of 40 are still 40,
 * not 80.
 */
function splatStations(f, airQuality) {
  const out = new Float32Array(f.nx * f.ny);
  const stamp = (lng, lat, pm, sigma) => {
    if (!Number.isFinite(pm) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const reach = sigma * 3;
    const cosLat = Math.max(Math.cos(lat * DEG), 0.2);
    const j0 = Math.max(0, Math.floor((f.la1 - (lat + reach)) / f.dy));
    const j1 = Math.min(f.ny - 1, Math.ceil((f.la1 - (lat - reach)) / f.dy));
    const spanX = Math.ceil(reach / cosLat / f.dx);
    const ic = Math.round((lng - f.lo1) / f.dx);
    for (let j = j0; j <= j1; j++) {
      const cellLat = f.la1 - j * f.dy;
      for (let di = -spanX; di <= spanX; di++) {
        const i = (((ic + di) % f.nx) + f.nx) % f.nx;
        const dLng = di * f.dx * cosLat;
        const dLat = cellLat - lat;
        const w = Math.exp(-(dLng * dLng + dLat * dLat) / (2 * sigma * sigma));
        const k = j * f.nx + i;
        const val = pm * w;
        if (val > out[k]) out[k] = val;
      }
    }
  };
  for (const country of airQuality) {
    stamp(country.lng, country.lat, country.pm25, 3.2);
    country.cities?.forEach(c => stamp(c.lng, c.lat, c.pm25, 1.6));
  }
  return out;
}

/**
 * Semi-Lagrangian advection: each step, every cell takes the value found
 * upwind of it, a little diluted, and the measured sources are re-applied.
 * After enough steps this settles into plumes that trail downwind of every
 * source, as long as the wind carries them before they fade.
 *
 * `shift` is how many degrees one step moves per m/s of wind; with `decay`
 * it sets the plume length (≈ speed · shift / (1 − decay) degrees).
 */
function disperse(f, sources, { steps = 120, decay = 0.972, shift = 0.12 } = {}) {
  let cur = Float32Array.from(sources);
  let next = new Float32Array(cur.length);
  for (let s = 0; s < steps; s++) {
    for (let j = 0; j < f.ny; j++) {
      const lat = f.la1 - j * f.dy;
      const invCos = 1 / Math.max(Math.cos(lat * DEG), 0.15);
      const row = j * f.nx;
      for (let i = 0; i < f.nx; i++) {
        const k = row + i;
        const lng = f.lo1 + i * f.dx;
        const val = bilinear(
          f, cur,
          lng - f.u[k] * shift * invCos,
          lat - f.v[k] * shift
        ) * decay;
        next[k] = val > sources[k] ? val : sources[k];
      }
    }
    [cur, next] = [next, cur];
  }
  return cur;
}

/** Wind at a point: speed in m/s and the compass direction it blows FROM. */
export function windAt(field, lng, lat) {
  const u = bilinear(field, field.u, lng, lat);
  const v = bilinear(field, field.v, lng, lat);
  const speed = Math.hypot(u, v);
  // Meteorological convention: 0° = wind coming from the north.
  const from = (Math.atan2(-u, -v) / DEG + 360) % 360;
  return { speed, from };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export function compassPoint(deg) {
  return COMPASS[Math.round(deg / 45) % 8];
}
