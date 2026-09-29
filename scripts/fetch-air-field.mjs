#!/usr/bin/env node
/**
 * Writes public/data/air-field.json with the latest NASA GEOS-CF wind and
 * PM2.5 — the same data /api/air-field serves live.
 *
 *   npm run data:air
 *
 * You do not need this on Vercel: the function in api/air-field.js keeps the
 * data fresh on its own. The bundled file is only the fallback the app uses
 * when that function is unreachable (e.g. `vite preview`, or NASA down), and
 * this script refreshes it so the fallback is recent instead of the 2014 GFS
 * sample.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGeosCfField } from '../api/_geos-cf.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'air-field.json');

try {
  console.log('Pidiendo viento y PM2.5 a NASA GEOS-CF…');
  const started = Date.now();
  const field = await fetchGeosCfField({ timeoutMs: 60000 });
  field._meta.kind = 'snapshot';

  // Temp file first: a failed run never leaves a half-written grid behind.
  const tmp = `${OUT}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(field));
  fs.renameSync(tmp, OUT);

  const kb = Math.round(fs.statSync(OUT).size / 1024);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`✓ ${path.relative(ROOT, OUT)} (${kb} KB, ${secs} s) · válido para ${field._meta.validTime}`);
  const { wind, pm } = field._meta.filledCells;
  if (wind || pm) console.log(`  celdas sin dato rellenadas con sus vecinas: viento ${wind}, PM2.5 ${pm}`);
} catch (err) {
  console.error(`✗ ${err.message}`);
  console.error('  El archivo anterior se ha dejado intacto.');
  process.exit(1);
}
