import { useEffect, useRef, memo } from 'react';
import styles from './AirFlowLayer.module.css';

/**
 * Paleta de colores para las estelas de partículas, alineada con la rampa FOG.air
 * y los umbrales de la OMS para concentraciones de PM2.5 (0 a 75+ µg/m³).
 */
const PM_COLOR_RAMP = [
  'rgba(255, 214, 10, 0.75)',  // [0] <= 12 µg/m³: Aire limpio (amarillo puro)
  'rgba(255, 183, 3, 0.80)',   // [1] <= 25 µg/m³: Aceptable (ámbar cálido)
  'rgba(255, 159, 10, 0.85)',  // [2] <= 37 µg/m³: Moderado (naranja suave)
  'rgba(255, 107, 53, 0.88)',  // [3] <= 50 µg/m³: Insalubre sensible (naranja óxido)
  'rgba(255, 45, 85, 0.92)',   // [4] <= 75 µg/m³: Dañino (rojo brillante)
  'rgba(204, 0, 51, 0.95)',    // [5] > 75 µg/m³: Peligroso / Irrespirable (carmesí profundo)
];

const COS_HORIZON_CUTOFF = Math.cos((85 * Math.PI) / 180); // ~0.08715
const SIN_MAX_LAT = Math.sin((85 * Math.PI) / 180); // Límite polar de regeneración

function getPmBucket(pm) {
  if (pm <= 12) return 0;
  if (pm <= 25) return 1;
  if (pm <= 37) return 2;
  if (pm <= 50) return 3;
  if (pm <= 75) return 4;
  return 5;
}

/**
 * Muestreo bilineal de u, v y pm sobre la cuadrícula toroidal de 5x5 grados.
 * Reutiliza el objeto `out` para evitar crear objetos en el bucle de animación.
 */
function sampleField(field, lng, lat, out) {
  let l = lng;
  while (l < -180) l += 360;
  while (l >= 180) l -= 360;

  const x = (l - field.lo1) / field.dx;
  const x0 = Math.floor(x) % field.nx;
  const x1 = (x0 + 1) % field.nx;
  const fx = x - Math.floor(x);

  const clampedLat = Math.max(-90, Math.min(90, lat));
  const y = (field.la1 - clampedLat) / field.dy;
  const y0 = Math.max(0, Math.min(field.ny - 1, Math.floor(y)));
  const y1 = Math.max(0, Math.min(field.ny - 1, y0 + 1));
  const fy = y - y0;

  const row0 = y0 * field.nx;
  const row1 = y1 * field.nx;
  const i00 = row0 + x0;
  const i10 = row0 + x1;
  const i01 = row1 + x0;
  const i11 = row1 + x1;

  const u0 = field.u[i00] * (1 - fx) + field.u[i10] * fx;
  const u1 = field.u[i01] * (1 - fx) + field.u[i11] * fx;
  out.u = u0 * (1 - fy) + u1 * fy;

  const v0 = field.v[i00] * (1 - fx) + field.v[i10] * fx;
  const v1 = field.v[i01] * (1 - fx) + field.v[i11] * fx;
  out.v = v0 * (1 - fy) + v1 * fy;

  const pm0 = field.pm[i00] * (1 - fx) + field.pm[i10] * fx;
  const pm1 = field.pm[i01] * (1 - fx) + field.pm[i11] * fx;
  out.pm = pm0 * (1 - fy) + pm1 * fy;
}

/**
 * Genera una posición aleatoria distribuida uniformemente por unidad de área sobre la esfera,
 * evitando la concentración artificial de partículas en los polos generada por grados lineales.
 */
function randomSphereCoord(target, index) {
  target.lng[index] = Math.random() * 360 - 180;
  const z = (Math.random() * 2 - 1) * SIN_MAX_LAT;
  target.lat[index] = (Math.asin(z) * 180) / Math.PI;
}

function AirFlowLayer({ map, field, visible }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !field || !visible) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animId = null;
    let isPaused = false;

    // Detectar preferencia de accesibilidad para movimiento reducido
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;

    // Buffer de partículas con TypedArrays para cero presión sobre el garbage collector
    let particleCount = 0;
    let pLng = new Float32Array(0);
    let pLat = new Float32Array(0);
    let prevX = new Float32Array(0);
    let prevY = new Float32Array(0);
    let pAge = new Int16Array(0);
    let pMaxAge = new Int16Array(0);

    const particles = { lng: pLng, lat: pLat };
    const sampleResult = { u: 0, v: 0, pm: 0 };

    function respawn(i) {
      randomSphereCoord(particles, i);
      pMaxAge[i] = Math.floor(60 + Math.random() * 80);
      pAge[i] = Math.floor(Math.random() * pMaxAge[i]);
      prevX[i] = -1;
      prevY[i] = -1;
    }

    function initParticles(count) {
      particleCount = count;
      pLng = new Float32Array(count);
      pLat = new Float32Array(count);
      prevX = new Float32Array(count);
      prevY = new Float32Array(count);
      pAge = new Int16Array(count);
      pMaxAge = new Int16Array(count);

      particles.lng = pLng;
      particles.lat = pLat;

      for (let i = 0; i < count; i++) {
        respawn(i);
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Escala unas 5.000 partículas para pantallas estándar, o menos con reducción de movimiento
      const baseCount = reducedMotion ? 1500 : 5000;
      const targetCount = Math.round(
        baseCount * Math.min(2.0, Math.max(0.4, (width * height) / (1920 * 1080)))
      );

      initParticles(targetCount);
      ctx.clearRect(0, 0, width, height);
    }

    resize();

    function clearTrails() {
      if (width > 0 && height > 0) {
        ctx.clearRect(0, 0, width, height);
        prevX.fill(-1);
        prevY.fill(-1);
      }
    }

    // El desvanecimiento por frame con destination-in reduce la opacidad acumulada
    // sin alterar los colores de las capas inferiores del mapa.
    function fadeTrails() {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.94)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    function renderFrame() {
      if (isPaused || width === 0 || height === 0) {
        animId = requestAnimationFrame(renderFrame);
        return;
      }

      fadeTrails();

      const center = map.getCenter();
      const zoom = map.getZoom();

      const cLatRad = (center.lat * Math.PI) / 180;
      const cLngRad = (center.lng * Math.PI) / 180;
      const cosCLat = Math.cos(cLatRad);
      const sinCLat = Math.sin(cLatRad);

      // Factor de desplazamiento inversamente proporcional a la escala visual del zoom
      let speedScale = 0.0055 / Math.pow(2, Math.max(0, zoom - 1));
      if (reducedMotion) speedScale *= 0.35;

      // Agrupación por color: 6 rutas para minimizar llamadas y cambios de strokeStyle en el canvas
      const paths = [
        new Path2D(),
        new Path2D(),
        new Path2D(),
        new Path2D(),
        new Path2D(),
        new Path2D(),
      ];

      for (let i = 0; i < particleCount; i++) {
        pAge[i]++;
        if (pAge[i] >= pMaxAge[i]) {
          respawn(i);
          continue;
        }

        const curLng = pLng[i];
        const curLat = pLat[i];

        sampleField(field, curLng, curLat, sampleResult);

        // Avance en la esfera considerando convergencia de meridianos
        const latRad = (curLat * Math.PI) / 180;
        const cosLat = Math.max(0.08, Math.cos(latRad));

        const nextLng = curLng + (sampleResult.u * speedScale) / cosLat;
        const nextLat = curLat + sampleResult.v * speedScale;

        if (nextLat > 85 || nextLat < -85) {
          respawn(i);
          continue;
        }

        pLng[i] = nextLng;
        pLat[i] = nextLat;

        // Omitir partículas en la cara oculta del globo terráqueo (> 85° desde el centro de cámara)
        const nextLngRad = (nextLng * Math.PI) / 180;
        const nextLatRad = (nextLat * Math.PI) / 180;
        const cosDist =
          sinCLat * Math.sin(nextLatRad) +
          cosCLat * Math.cos(nextLatRad) * Math.cos(nextLngRad - cLngRad);

        if (cosDist < COS_HORIZON_CUTOFF) {
          prevX[i] = -1;
          prevY[i] = -1;
          continue;
        }

        const pt = map.project([nextLng, nextLat]);

        if (pt.x < -30 || pt.x > width + 30 || pt.y < -30 || pt.y > height + 30) {
          respawn(i);
          continue;
        }

        const px = prevX[i];
        const py = prevY[i];

        if (px >= 0 && py >= 0) {
          const dx = pt.x - px;
          const dy = pt.y - py;
          // Filtrar saltos de proyección al cruzar el antimeridiano
          if (dx * dx + dy * dy < 8000) {
            const bucket = getPmBucket(sampleResult.pm);
            paths[bucket].moveTo(px, py);
            paths[bucket].lineTo(pt.x, pt.y);
          }
        }

        prevX[i] = pt.x;
        prevY[i] = pt.y;
      }

      ctx.lineWidth = reducedMotion ? 1.0 : 1.35;
      ctx.lineCap = 'round';

      for (let b = 0; b < 6; b++) {
        ctx.strokeStyle = PM_COLOR_RAMP[b];
        ctx.stroke(paths[b]);
      }

      animId = requestAnimationFrame(renderFrame);
    }

    animId = requestAnimationFrame(renderFrame);

    // Eventos del mapa: limpiar estelas durante el arrastre o zoom para evitar líneas estiradas
    map.on('movestart', clearTrails);
    map.on('move', clearTrails);
    map.on('moveend', clearTrails);
    map.on('zoomstart', clearTrails);
    map.on('zoom', clearTrails);
    map.on('zoomend', clearTrails);

    // Pausar animación cuando la pestaña pasa a segundo plano
    function handleVisibility() {
      isPaused = document.hidden;
      if (!isPaused) clearTrails();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    // Redimensionamiento de ventana
    window.addEventListener('resize', resize);

    function handleMotionChange(e) {
      reducedMotion = e.matches;
      resize();
    }
    motionQuery.addEventListener('change', handleMotionChange);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      map.off('movestart', clearTrails);
      map.off('move', clearTrails);
      map.off('moveend', clearTrails);
      map.off('zoomstart', clearTrails);
      map.off('zoom', clearTrails);
      map.off('zoomend', clearTrails);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', resize);
      motionQuery.removeEventListener('change', handleMotionChange);
      ctx.clearRect(0, 0, width, height);
    };
  }, [map, field, visible]);

  if (!visible || !field) return null;

  return <canvas ref={canvasRef} className={styles.canvas} />;
}

export default memo(AirFlowLayer);
