import { fetchGeosCfField } from './_geos-cf.js';

/**
 * GET /api/air-field — today's wind and PM2.5 from NASA GEOS-CF, in the same
 * format as public/data/air-field.json.
 *
 * The response is cached on Vercel's CDN for 3 hours, and served stale for up
 * to a day while a fresh copy is fetched in the background. However many
 * people open the site, NASA sees about eight requests a day, and nobody
 * waits on them after the first.
 *
 * On failure it answers 502 with a short cache so a NASA outage is retried in
 * a minute rather than hammered; the app then falls back to the bundled
 * sample in public/data/air-field.json.
 *
 * Plain Node (req, res) signature on purpose: it runs unchanged as a Vercel
 * function and inside the Vite dev server (see vite.config.js).
 */
export default async function handler(req, res) {
  try {
    const field = await fetchGeosCfField();
    const body = JSON.stringify(field);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10800, stale-while-revalidate=86400');
    res.end(body);
  } catch (err) {
    console.error('[air-field] GEOS-CF no disponible:', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.end(JSON.stringify({ error: err.message }));
  }
}
