/**
 * NASA GEOS-CF → air-field grid.
 *
 * GEOS-CF (Goddard Earth Observing System, Composition Forecast) is NASA's
 * global atmospheric composition model. Its analysis stream is published on
 * an OPeNDAP / GrADS Data Server with no key and no login, hourly, on a 0.25°
 * grid. We read two collections at their latest hour, subsampled to 1°:
 *
 *   met_tavg_1hr_glo_L1440x721_slv   u, v   wind in the lowest model layer (m/s)
 *   aqc_tavg_1hr_glo_L1440x721_slv   pm25_rh35   surface PM2.5 at 35 % RH (µg/m³)
 *
 * Both come from the same model run, so the wind and the pollution it carries
 * are consistent with each other.
 *
 * Shared by the Vercel function (api/air-field.js), the Vite dev server and
 * `npm run data:air`. Files in api/ that start with "_" are not deployed as
 * functions by Vercel.
 *
 * The server's ASCII responses look like this (checked against the live
 * server, 28-sep-2026):
 *
 *   u, [1][1][181][360]
 *   [0][0][0], -0.1123, -0.1123, …          ← one line per latitude, south → north
 *   …
 *   time, [1]
 *   739888.3541666666                       ← days since 0001-01-01
 *   lev, [1]
 *   72.0
 *   lat, [181]
 *   -90.0, -89.0, …
 *   lon, [360]
 *   -180.0, -179.0, …
 */

export const GEOS_CF_BASE = process.env.GEOS_CF_BASE
  ?? 'https://opendap.nccs.nasa.gov/dods/gmao/geos-cf/v2/ana';

const MET = 'met_tavg_1hr_glo_L1440x721_slv';
const AQC = 'aqc_tavg_1hr_glo_L1440x721_slv';

// 0.25° native grid, read every 4th point → 1°: 181 latitudes × 360 longitudes.
const STRIDE = 4;
const NATIVE_NY = 721;
const NATIVE_NX = 1440;
const NY = (NATIVE_NY - 1) / STRIDE + 1; // 181
const NX = NATIVE_NX / STRIDE; // 360

// GrADS "days since 1-1-1" → Unix days. Derived from the live server:
// 739888.3541666 ↔ 2026-09-28T08:30Z.
const GRADS_EPOCH_OFFSET_DAYS = 719164;

const FILL = 1e10; // the server's fill value is 1e15; anything this big is missing

async function getText(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`NASA respondió HTTP ${res.status} en ${url.split('?')[0]}`);
  return res.text();
}

/** Number of time steps in a collection, read from its DDS. */
async function timeSteps(dataset, timeoutMs) {
  const dds = await getText(`${GEOS_CF_BASE}/${dataset}.dds`, timeoutMs);
  const m = dds.match(/Float64 time\[time = (\d+)\]/);
  if (!m) throw new Error(`${dataset}.dds: no se encontró la dimensión time`);
  return Number(m[1]);
}

/**
 * Parse a GrADS ASCII response into { name: { values: Float32Array (north →
 * south, row-major), time } }. Rows arrive south → north and are flipped here
 * so the grid starts at la1 = 90 like the rest of the app expects.
 */
export function parseGradsAscii(text) {
  const out = {};
  const lines = text.split('\n');
  let current = null;
  let row = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const header = line.match(/^([a-z0-9_]+), \[(\d+)\]\[(\d+)\]\[(\d+)\]\[(\d+)\]$/i);
    if (header) {
      const [, name, , , ny, nx] = header;
      if (Number(ny) !== NY || Number(nx) !== NX) {
        throw new Error(`${name}: se esperaba una cuadrícula ${NY}×${NX} y llegó ${ny}×${nx}`);
      }
      current = { name, values: new Float32Array(NY * NX), rows: 0, time: null };
      out[name] = current;
      row = 0;
      continue;
    }

    if (line.startsWith('[') && current) {
      const comma = line.indexOf(',');
      const vals = line.slice(comma + 1).split(',');
      if (vals.length !== NX) throw new Error(`${current.name}: fila ${row} con ${vals.length} valores`);
      // Southmost row first on the wire; store it at the bottom.
      const target = (NY - 1 - row) * NX;
      for (let x = 0; x < NX; x++) {
        const v = Number(vals[x]);
        current.values[target + x] = Number.isFinite(v) && Math.abs(v) < FILL ? v : NaN;
      }
      row++;
      current.rows = row;
      continue;
    }

    // The map arrays follow each variable; the only one we need is time.
    if (/^time, \[1\]$/.test(line) && current) {
      current.time = Number(lines[i + 1]);
      i++;
      continue;
    }
  }
  for (const v of Object.values(out)) {
    if (v.rows !== NY) throw new Error(`${v.name}: llegaron ${v.rows} filas de ${NY}`);
  }
  return out;
}

/** Fill NaN cells from their neighbours; returns how many were missing. */
function fillGaps(values) {
  let missing = 0;
  for (const v of values) if (Number.isNaN(v)) missing++;
  if (missing > values.length * 0.2) {
    throw new Error(`faltan demasiados valores (${missing} de ${values.length})`);
  }
  let left = missing;
  while (left) {
    const next = Float32Array.from(values);
    for (let k = 0; k < values.length; k++) {
      if (!Number.isNaN(values[k])) continue;
      const x = k % NX;
      const y = (k / NX) | 0;
      let sum = 0;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = y + dy;
        if (yy < 0 || yy >= NY) continue;
        const v = values[yy * NX + ((x + dx + NX) % NX)];
        if (!Number.isNaN(v)) { sum += v; n++; }
      }
      if (n) next[k] = sum / n;
    }
    values.set(next);
    left = 0;
    for (const v of values) if (Number.isNaN(v)) left++;
  }
  return missing;
}

const round2 = arr => Array.from(arr, v => Math.round(v * 100) / 100);

/**
 * Fetch the latest hour of wind and PM2.5 and return it in the app's
 * air-field format. Throws with a readable Spanish message on any failure.
 */
export async function fetchGeosCfField({ timeoutMs = 20000 } = {}) {
  const [metSteps, aqcSteps] = await Promise.all([
    timeSteps(MET, timeoutMs),
    timeSteps(AQC, timeoutMs),
  ]);
  // Latest hour both collections have.
  const t = Math.min(metSteps, aqcSteps) - 1;
  const slice = `[${t}:${t}][0:0][0:${STRIDE}:${NATIVE_NY - 1}][0:${STRIDE}:${NATIVE_NX - STRIDE}]`;

  const [metText, aqcText] = await Promise.all([
    getText(`${GEOS_CF_BASE}/${MET}.ascii?u${slice},v${slice}`, timeoutMs),
    getText(`${GEOS_CF_BASE}/${AQC}.ascii?pm25_rh35${slice}`, timeoutMs),
  ]);

  const met = parseGradsAscii(metText);
  const aqc = parseGradsAscii(aqcText);
  if (!met.u || !met.v || !aqc.pm25_rh35) {
    throw new Error('la respuesta de la NASA no trae u, v y pm25_rh35');
  }

  const filled = {
    wind: fillGaps(met.u.values) + fillGaps(met.v.values),
    pm: fillGaps(aqc.pm25_rh35.values),
  };
  // PM2.5 cannot be negative; the model occasionally dips a hair below zero.
  const pm = aqc.pm25_rh35.values.map(v => (v < 0 ? 0 : v));

  const toIso = days => (Number.isFinite(days)
    // Rounded to the minute: the float day count lands a hair off (08:29:59.999).
    ? new Date(Math.round((days - GRADS_EPOCH_OFFSET_DAYS) * 1440) * 60000).toISOString().replace('.000Z', 'Z')
    : null);
  const validTime = toIso(met.u.time);
  // Both collections share one time axis today; if that ever changes, say so
  // in the metadata instead of silently pairing wind and PM2.5 from
  // different hours.
  const pmTime = toIso(aqc.pm25_rh35.time);

  return {
    _meta: {
      kind: 'live',
      sourceShort: 'NASA GEOS-CF',
      source: 'NASA GMAO GEOS-CF v2 (análisis): viento en la capa más baja del modelo y PM2.5 en superficie',
      pmSource: 'PM2.5 modelado por NASA GEOS-CF',
      url: GEOS_CF_BASE,
      collections: [MET, AQC],
      validTime,
      ...(pmTime !== validTime ? { pmValidTime: pmTime } : {}),
      fetchedAt: new Date().toISOString(),
      resolution: '1° (submuestreo de 0,25°)',
      filledCells: filled,
    },
    lo1: -180,
    la1: 90,
    dx: 1,
    dy: 1,
    nx: NX,
    ny: NY,
    u: round2(met.u.values),
    v: round2(met.v.values),
    pm: round2(pm),
  };
}
