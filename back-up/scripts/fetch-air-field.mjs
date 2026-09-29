#!/usr/bin/env node
/**
 * scripts/fetch-air-field.mjs
 *
 * Genera el campo vectorial de viento (U, V) y concentración de PM2.5
 * a escala global para la capa "Aire en movimiento".
 *
 * Cuadrícula de 5° de resolución:
 * - Longitudes: -180 a 175 (72 columnas, dx = 5)
 * - Latitudes: 90 a -90 (37 filas, dy = 5)
 * - Puntos totales: 72 * 37 = 2.664 puntos
 *
 * Pide a Open-Meteo en lotes controlados con pausas y reintentos:
 * - Viento: https://api.open-meteo.com/v1/forecast (current=wind_speed_10m,wind_direction_10m, wind_speed_unit=ms)
 * - PM2.5: https://air-quality-api.open-meteo.com/v1/air-quality (current=pm2_5)
 *
 * Convierte dirección meteorológica a componentes cartesianas:
 *   u = -velocidad * sin(dir)
 *   v = -velocidad * cos(dir)
 *
 * Escribe public/data/air-field.json con redondeo a 2 decimales para minimizar peso.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(ROOT, 'public', 'data', 'air-field.json');

const NX = 72; // Longitud: -180 a 175 (paso 5°)
const NY = 37; // Latitud: 90 a -90 (paso 5°)
const LO1 = -180;
const LA1 = 90;
const DX = 5;
const DY = 5;
const TOTAL_POINTS = NX * NY;

const BATCH_SIZE = 72; // 1 fila por petición
const DELAY_BETWEEN_BATCHES_MS = 300;
const MAX_RETRIES = 6;

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Petición con reintentos para manejar límites de tasa (429) o fallos de red.
 * Si Open-Meteo responde 429 (límite por minuto), espera 25 segundos para liberar la ventana deslizante.
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 429) {
        const waitMs = 25000 + attempt * 5000;
        console.warn(`    [Límite por minuto (HTTP 429)] Esperando ${waitMs / 1000}s para reanudar...`);
        await sleep(waitMs);
        attempt++;
        continue;
      }
      if (res.status >= 500) {
        const delay = Math.pow(2, attempt) * 1500;
        console.warn(`    [HTTP ${res.status}] Reintentando en ${delay / 1000}s...`);
        await sleep(delay);
        attempt++;
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.pow(2, attempt) * 1500;
      console.warn(`    [Fallo de red: ${err.message}] Reintentando en ${delay / 1000}s...`);
      await sleep(delay);
      attempt++;
    }
  }
}

/**
 * Genera la lista ordenada de coordenadas (fila por fila, de N a S, y de O a E).
 */
function generateGrid() {
  const points = [];
  for (let r = 0; r < NY; r++) {
    const lat = +(LA1 - r * DY).toFixed(2);
    for (let c = 0; c < NX; c++) {
      const lng = +(LO1 + c * DX).toFixed(2);
      points.push({ index: r * NX + c, r, c, lat, lng });
    }
  }
  return points;
}

/**
 * Rellena valores nulos interpolando con vecinos inmediatos válidos en la cuadrícula.
 */
function fillMissingValues(grid, values, isWrapX = true) {
  let filledCount = 0;
  const result = [...values];

  for (let i = 0; i < result.length; i++) {
    if (result[i] != null && !Number.isNaN(result[i])) continue;

    const r = Math.floor(i / NX);
    const c = i % NX;
    const neighbors = [];

    // Vecino oeste (con envoltura toroidal)
    const westCol = c > 0 ? c - 1 : (isWrapX ? NX - 1 : -1);
    if (westCol >= 0) {
      const v = values[r * NX + westCol];
      if (v != null && !Number.isNaN(v)) neighbors.push(v);
    }

    // Vecino este (con envoltura toroidal)
    const eastCol = c < NX - 1 ? c + 1 : (isWrapX ? 0 : -1);
    if (eastCol >= 0) {
      const v = values[r * NX + eastCol];
      if (v != null && !Number.isNaN(v)) neighbors.push(v);
    }

    // Vecino norte
    if (r > 0) {
      const v = values[(r - 1) * NX + c];
      if (v != null && !Number.isNaN(v)) neighbors.push(v);
    }

    // Vecino sur
    if (r < NY - 1) {
      const v = values[(r + 1) * NX + c];
      if (v != null && !Number.isNaN(v)) neighbors.push(v);
    }

    if (neighbors.length > 0) {
      const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
      result[i] = Math.round(avg * 100) / 100;
      filledCount++;
    } else {
      result[i] = 0;
      filledCount++;
    }
  }

  return { filled: result, count: filledCount };
}

async function main() {
  console.log('Iniciando descarga de campo de aire global (72x37 = 2.664 puntos)...');
  const points = generateGrid();

  const rawU = new Array(TOTAL_POINTS).fill(null);
  const rawV = new Array(TOTAL_POINTS).fill(null);
  const rawPm = new Array(TOTAL_POINTS).fill(null);

  const totalBatches = Math.ceil(points.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = points.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const lats = batch.map(p => p.lat).join(',');
    const lngs = batch.map(p => p.lng).join(',');

    process.stdout.write(`  Lote ${b + 1}/${totalBatches} (lat ${batch[0].lat}°) ... `);

    // 1. Viento a 10m
    const windUrl = `${FORECAST_BASE}?latitude=${lats}&longitude=${lngs}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
    const windData = await fetchWithRetry(windUrl);
    const windList = Array.isArray(windData) ? windData : [windData];

    // 2. Calidad de aire (PM2.5)
    const airUrl = `${AIR_QUALITY_BASE}?latitude=${lats}&longitude=${lngs}&current=pm2_5`;
    const airData = await fetchWithRetry(airUrl);
    const airList = Array.isArray(airData) ? airData : [airData];

    for (let i = 0; i < batch.length; i++) {
      const globalIdx = batch[i].index;

      // Procesar viento
      const currentWind = windList[i]?.current;
      if (currentWind?.wind_speed_10m != null && currentWind?.wind_direction_10m != null) {
        const speed = currentWind.wind_speed_10m;
        const dirRad = (currentWind.wind_direction_10m * Math.PI) / 180;
        // u = -speed * sin(dir), v = -speed * cos(dir)
        const u = -speed * Math.sin(dirRad);
        const v = -speed * Math.cos(dirRad);
        rawU[globalIdx] = Math.round(u * 100) / 100;
        rawV[globalIdx] = Math.round(v * 100) / 100;
      }

      // Procesar PM2.5
      const currentAir = airList[i]?.current;
      if (currentAir?.pm2_5 != null) {
        rawPm[globalIdx] = Math.round(currentAir.pm2_5 * 100) / 100;
      }
    }

    process.stdout.write('completado\n');
    if (b < totalBatches - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log('\nVerificando e interpolando puntos faltantes...');
  const { filled: finalU, count: missingU } = fillMissingValues(points, rawU);
  const { filled: finalV, count: missingV } = fillMissingValues(points, rawV);
  const { filled: finalPm, count: missingPm } = fillMissingValues(points, rawPm);

  const payload = {
    _meta: {
      fuente: 'Open-Meteo (Forecast API & Air Quality API)',
      urls: [
        'https://api.open-meteo.com/v1/forecast',
        'https://air-quality-api.open-meteo.com/v1/air-quality',
      ],
      fecha_descarga: new Date().toISOString(),
      resolucion: 'Cuadrícula global regular de 5x5 grados',
      nx: NX,
      ny: NY,
      puntos_totales: TOTAL_POINTS,
      puntos_rellenados_u: missingU,
      puntos_rellenados_v: missingV,
      puntos_rellenados_pm: missingPm,
      generado_por: 'npm run data:air (scripts/fetch-air-field.mjs)',
    },
    lo1: LO1,
    la1: LA1,
    dx: DX,
    dy: DY,
    nx: NX,
    ny: NY,
    u: finalU,
    v: finalV,
    pm: finalPm,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload) + '\n', 'utf8');

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`\n✓ Archivo guardado: public/data/air-field.json (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`  - Puntos de viento completados: ${TOTAL_POINTS - missingU} (rellenados: ${missingU})`);
  console.log(`  - Puntos de PM2.5 completados: ${TOTAL_POINTS - missingPm} (rellenados: ${missingPm})`);
}

main().catch(err => {
  console.error('\n✗ Error al generar el campo de aire:', err.message);
  process.exit(1);
});
