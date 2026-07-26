import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to load and cache data from JSON files
 */
export function useMapData() {
  const [data, setData] = useState({
    co2: null,
    airQuality: null,
    oceanPlastic: null,
    rivers: null,
    protectedAreas: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cacheRef = useRef({});

  const fetchJSON = useCallback(async (url) => {
    if (cacheRef.current[url]) return cacheRef.current[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    const json = await res.json();
    cacheRef.current[url] = json;
    return json;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        const [co2, airQualityBase, oceanPlastic, rivers, protectedAreas] = await Promise.all([
          fetchJSON('/data/contamination/co2-emissions.json'),
          fetchJSON('/data/contamination/air-quality.json'),
          fetchJSON('/data/contamination/ocean-plastic.json'),
          fetchJSON('/data/life/rivers.json'),
          fetchJSON('/data/life/protected-areas.json'),
        ]);

        let airQuality = airQualityBase;
        try {
          let lats = [];
          let lngs = [];
          airQualityBase.forEach(country => {
            lats.push(country.lat);
            lngs.push(country.lng);
            country.cities?.forEach(city => {
              lats.push(city.lat);
              lngs.push(city.lng);
            });
          });

          const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats.join(',')}&longitude=${lngs.join(',')}&current=pm2_5`;
          const res = await fetch(url);
          const realTimeData = await res.json();

          let dataIndex = 0;
          airQuality = airQualityBase.map(country => {
            const countryCurrent = realTimeData[dataIndex]?.current?.pm2_5 ?? country.pm25;
            dataIndex++;
            return {
              ...country,
              pm25: countryCurrent,
              cities: country.cities?.map(city => {
                const cityCurrent = realTimeData[dataIndex]?.current?.pm2_5 ?? city.pm25;
                dataIndex++;
                return { ...city, pm25: cityCurrent };
              })
            };
          });
        } catch (e) {
          console.error("Failed to fetch real-time air quality, falling back to static data", e);
        }

        if (!cancelled) {
          setData({ co2, airQuality, oceanPlastic, rivers, protectedAreas });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [fetchJSON]);

  return { data, loading, error };
}
