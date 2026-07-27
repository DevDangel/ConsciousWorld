#!/usr/bin/env node
/**
 * Regenerates the country-level datasets from the World Bank Open Data API.
 *
 *   npm run data:refresh
 *
 * Run it by hand — these indicators are updated roughly once a year, so
 * fetching them on every page load would add a second of latency and a runtime
 * failure mode for data that almost never changes. The generated files carry a
 * `_meta` block with the indicator ids, the source URL and the fetch date, so
 * every number on the map can be traced back to a query you can re-run.
 *
 * The API needs no key and sends `Access-Control-Allow-Origin: *`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

const API = 'https://api.worldbank.org/v2';
const FIRST_YEAR = 2014;
const LAST_YEAR = 2023;

const INDICATORS = {
  co2Total: 'EN.GHG.CO2.MT.CE.AR5',
  co2PerCapita: 'EN.GHG.CO2.PC.CE.AR5',
  protectedLand: 'ER.LND.PTLD.ZS',
  // Sector split. The UI groups these into energy / industry / transport /
  // buildings / other.
  sectorPower: 'EN.GHG.CO2.PI.MT.CE.AR5',
  sectorIndustrialCombustion: 'EN.GHG.CO2.IC.MT.CE.AR5',
  sectorIndustrialProcesses: 'EN.GHG.CO2.IP.MT.CE.AR5',
  sectorTransport: 'EN.GHG.CO2.TR.MT.CE.AR5',
  sectorBuildings: 'EN.GHG.CO2.BU.MT.CE.AR5',
  sectorFugitive: 'EN.GHG.CO2.FE.MT.CE.AR5',
  sectorAgriculture: 'EN.GHG.CO2.AG.MT.CE.AR5',
  sectorWaste: 'EN.GHG.CO2.WA.MT.CE.AR5',
};

const SPANISH = new Intl.DisplayNames(['es'], { type: 'region' });

/** Fetch one indicator for every country across the year range. */
async function fetchIndicator(id) {
  const url = `${API}/country/all/indicator/${id}?format=json&date=${FIRST_YEAR}:${LAST_YEAR}&per_page=20000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body) || !Array.isArray(body[1])) {
    throw new Error(`${id}: respuesta inesperada — ${JSON.stringify(body).slice(0, 200)}`);
  }
  const [meta, rows] = body;

  // iso3 -> { year -> value }, plus the iso2 code we need for Spanish names.
  const byCountry = new Map();
  for (const r of rows) {
    if (r.value == null || !r.countryiso3code) continue;
    let entry = byCountry.get(r.countryiso3code);
    if (!entry) {
      entry = { iso2: r.country?.id, years: new Map() };
      byCountry.set(r.countryiso3code, entry);
    }
    entry.years.set(Number(r.date), r.value);
  }
  return { lastUpdated: meta.lastupdated, byCountry };
}

/** Most recent value at or before `maxYear`. */
function latest(years, maxYear = LAST_YEAR) {
  if (!years) return null;
  for (let y = maxYear; y >= FIRST_YEAR; y--) {
    if (years.has(y)) return { year: y, value: years.get(y) };
  }
  return null;
}

/**
 * Representative point for a country: the centroid of its largest polygon.
 * A bounding-box centre would drop the United States in the Pacific because of
 * Alaska and Hawaii, and France in the Atlantic because of its overseas
 * departments.
 */
function centroid(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  const ringArea = (ring) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return a / 2;
  };

  let largest = null;
  let largestArea = -1;
  for (const poly of polygons) {
    const area = Math.abs(ringArea(poly[0]));
    if (area > largestArea) { largestArea = area; largest = poly[0]; }
  }

  let x = 0, y = 0, a2 = 0;
  for (let i = 0, j = largest.length - 1; i < largest.length; j = i++) {
    const f = largest[j][0] * largest[i][1] - largest[i][0] * largest[j][1];
    a2 += f;
    x += (largest[j][0] + largest[i][0]) * f;
    y += (largest[j][1] + largest[i][1]) * f;
  }
  a2 *= 0.5;
  return { lng: +(x / (6 * a2)).toFixed(2), lat: +(y / (6 * a2)).toFixed(2) };
}

function spanishName(iso2, fallback) {
  if (!iso2) return fallback;
  try {
    const name = SPANISH.of(iso2);
    return name && name !== iso2 ? name : fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  console.log('Descargando indicadores del Banco Mundial...\n');

  const geo = JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA, 'countries.geojson'), 'utf8'));
  // Joining against the polygons we actually render also drops the World Bank's
  // regional aggregates ("Africa Eastern and Southern", "European Union", ...)
  // for free, since none of them has a country polygon.
  const geoByIso = new Map(geo.features.map(f => [f.properties.iso, f]));

  const keys = Object.keys(INDICATORS);
  const results = await Promise.all(keys.map(async k => {
    const r = await fetchIndicator(INDICATORS[k]);
    console.log(`  ✓ ${INDICATORS[k].padEnd(28)} ${r.byCountry.size} países`);
    return [k, r];
  }));
  const data = Object.fromEntries(results);

  const fetchedAt = new Date().toISOString().slice(0, 10);
  const sourceMeta = (indicatorIds, extra = {}) => ({
    fuente: 'Banco Mundial — World Bank Open Data',
    url: 'https://api.worldbank.org/v2',
    indicadores: indicatorIds,
    actualizado_por_el_banco_mundial: data.co2Total.lastUpdated,
    descargado: fetchedAt,
    generado_por: 'npm run data:refresh (scripts/fetch-data.mjs)',
    ...extra,
  });

  // ——— CO2 emissions ———
  const co2 = [];
  for (const [iso, entry] of data.co2Total.byCountry) {
    const feature = geoByIso.get(iso);
    if (!feature) continue;

    const total = latest(entry.years);
    if (!total) continue;
    const year = total.year;

    const sectorAt = key => data[key].byCountry.get(iso)?.years.get(year) ?? 0;
    const buckets = {
      energy: sectorAt('sectorPower'),
      industry: sectorAt('sectorIndustrialCombustion') + sectorAt('sectorIndustrialProcesses'),
      transport: sectorAt('sectorTransport'),
      buildings: sectorAt('sectorBuildings'),
      other: sectorAt('sectorFugitive') + sectorAt('sectorAgriculture') + sectorAt('sectorWaste'),
    };
    const sectorSum = Object.values(buckets).reduce((a, b) => a + b, 0);

    // Trend: only keep years that were actually reported — no interpolation.
    const years = [];
    const trend = [];
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
      if (!entry.years.has(y)) continue;
      years.push(y);
      trend.push(+entry.years.get(y).toFixed(1));
    }

    const { lat, lng } = centroid(feature.geometry);
    co2.push({
      country: iso,
      name: spanishName(entry.iso2, feature.properties.name),
      lat,
      lng,
      year,
      co2_total_mt: +total.value.toFixed(1),
      co2_per_capita: +(latest(data.co2PerCapita.byCountry.get(iso)?.years)?.value ?? 0).toFixed(2),
      ...(sectorSum > 0 && {
        sector: Object.fromEntries(
          Object.entries(buckets).map(([k, v]) => [k, +((v / sectorSum) * 100).toFixed(1)])
        ),
      }),
      years,
      trend,
    });
  }
  co2.sort((a, b) => b.co2_total_mt - a.co2_total_mt);

  fs.writeFileSync(
    path.join(PUBLIC_DATA, 'contamination', 'co2-emissions.json'),
    JSON.stringify({
      _meta: sourceMeta(
        [INDICATORS.co2Total, INDICATORS.co2PerCapita,
        INDICATORS.sectorPower, INDICATORS.sectorIndustrialCombustion,
        INDICATORS.sectorIndustrialProcesses, INDICATORS.sectorTransport,
        INDICATORS.sectorBuildings, INDICATORS.sectorFugitive,
        INDICATORS.sectorAgriculture, INDICATORS.sectorWaste],
        {
          nota_sectores: 'Porcentajes sobre la suma de los sectores reportados. energy=Power Industry · industry=Industrial Combustion+Processes · other=Fugitive+Agriculture+Waste.',
          nota_coordenadas: 'Centroide del polígono más grande de cada país, calculado desde countries.geojson.',
        }
      ),
      data: co2,
    }, null, 1) + '\n'
  );

  // ——— Protected land ———
  const coverage = [];
  for (const [iso, entry] of data.protectedLand.byCountry) {
    const feature = geoByIso.get(iso);
    if (!feature) continue;
    const value = latest(entry.years);
    if (!value) continue;
    coverage.push({
      country: iso,
      name: spanishName(entry.iso2, feature.properties.name),
      year: value.year,
      protected_pct: +value.value.toFixed(1),
    });
  }
  coverage.sort((a, b) => b.protected_pct - a.protected_pct);

  fs.writeFileSync(
    path.join(PUBLIC_DATA, 'life', 'protected-coverage.json'),
    JSON.stringify({
      _meta: sourceMeta([INDICATORS.protectedLand], {
        indicador_nombre: 'Terrestrial protected areas (% of total land area)',
      }),
      data: coverage,
    }, null, 1) + '\n'
  );

  console.log(`\n✓ co2-emissions.json      ${co2.length} países`);
  console.log(`✓ protected-coverage.json ${coverage.length} países`);
}

main().catch(err => {
  console.error('\n✗ Falló la descarga:', err.message);
  process.exit(1);
});
