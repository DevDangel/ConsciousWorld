import { useState, useEffect, useCallback, useRef } from 'react';

const EMPTY = {
  co2: null,
  airQuality: null,
  oceanPlastic: null,
  rivers: null,
  riverCourses: null,
  protectedAreas: null,
  countries: null,
  sources: null,
};

/**
 * Read the rows out of a dataset.
 *
 * `npm run data:refresh` writes { _meta, data: [...] } so provenance travels
 * with the numbers, but earlier revisions of these files were a bare array —
 * and a browser holding a cached copy of the old shape would otherwise blow up
 * with an unattributable "Cannot read properties of undefined". Accept both,
 * and name the file if it is neither.
 */
function rows(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error(
    `${label}: formato no reconocido. Se esperaba un array o { data: [...] } y llegó ` +
    `${payload === null ? 'null' : typeof payload}. ` +
    `Si acabas de actualizar los datos, recarga forzando caché (Ctrl+Shift+R).`
  );
}

/**
 * Build the choropleth source: country polygons with every per-country metric
 * joined in by ISO-3 code. Done once here (data layer) so the map component
 * only ever swaps paint expressions, never re-joins.
 */
function joinCountries(countries, co2, coverage) {
  const co2ByIso = new Map(co2.map(d => [d.country, d]));
  const covByIso = new Map(coverage.map(d => [d.country, d]));

  return {
    type: 'FeatureCollection',
    features: countries.features.map(f => {
      const iso = f.properties.iso;
      const c = co2ByIso.get(iso);
      const v = covByIso.get(iso);
      return {
        ...f,
        properties: {
          ...f.properties,
          ...(c ? { co2: c.co2_total_mt, _co2: JSON.stringify(c) } : {}),
          ...(v ? { coverage: v.protected_pct, _coverage: JSON.stringify(v) } : {}),
        },
      };
    }),
  };
}

/**
 * Replace the static PM2.5 baseline with live readings from Open-Meteo.
 * Best-effort: any failure keeps the bundled values.
 */
async function withLiveAirQuality(base) {
  const lats = [];
  const lngs = [];
  base.forEach(country => {
    lats.push(country.lat);
    lngs.push(country.lng);
    country.cities?.forEach(city => {
      lats.push(city.lat);
      lngs.push(city.lng);
    });
  });

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats.join(',')}&longitude=${lngs.join(',')}&current=pm2_5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);

  const live = await res.json();
  if (!Array.isArray(live)) throw new Error('Open-Meteo devolvió un formato inesperado');

  let i = 0;
  return base.map(country => {
    const countryPm = live[i++]?.current?.pm2_5 ?? country.pm25;
    return {
      ...country,
      pm25: countryPm,
      cities: country.cities?.map(city => ({
        ...city,
        pm25: live[i++]?.current?.pm2_5 ?? city.pm25,
      })),
    };
  });
}

/**
 * Loads every dataset the map needs. Returns a `live` flag so the UI can say
 * whether PM2.5 is real-time or the bundled 2023 baseline.
 */
export function useMapData() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cacheRef = useRef({});

  const retry = useCallback(() => setReloadKey(k => k + 1), []);

  const fetchJSON = useCallback(async (url) => {
    if (cacheRef.current[url]) return cacheRef.current[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${res.status})`);
    const json = await res.json();
    cacheRef.current[url] = json;
    return json;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const [co2, airBase, oceanPlastic, rivers, riverCourses, protectedAreas, countries, coverage] =
          await Promise.all([
            fetchJSON('/data/contamination/co2-emissions.json'),
            fetchJSON('/data/contamination/air-quality.json'),
            fetchJSON('/data/contamination/ocean-plastic.json'),
            fetchJSON('/data/life/rivers.json'),
            fetchJSON('/data/life/river-courses.geojson'),
            fetchJSON('/data/life/protected-areas.json'),
            fetchJSON('/data/countries.geojson'),
            fetchJSON('/data/life/protected-coverage.json'),
          ]);

        const co2Rows = rows(co2, 'co2-emissions.json');
        const coverageRows = rows(coverage, 'protected-coverage.json');
        if (!Array.isArray(countries?.features)) {
          throw new Error('countries.geojson: no es un FeatureCollection válido');
        }

        let airQuality = airBase;
        let isLive = false;
        try {
          airQuality = await withLiveAirQuality(airBase);
          isLive = true;
        } catch (e) {
          console.warn('PM2.5 en vivo no disponible, se usa la línea base:', e.message);
        }

        if (cancelled) return;
        setData({
          co2: co2Rows,
          airQuality,
          oceanPlastic,
          rivers,
          riverCourses,
          protectedAreas,
          countries: joinCountries(countries, co2Rows, coverageRows),
          sources: { co2: co2?._meta ?? null, coverage: coverage?._meta ?? null },
        });
        setLive(isLive);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setData(EMPTY);
        setError(err.message);
        setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [fetchJSON, reloadKey]);

  return { data, loading, error, live, retry };
}
