import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * MapLibre 6 runs its GeoJSON/vector parsing in a web worker that ships as a
 * separate file. It resolves the URL at runtime:
 *
 *   const name = url.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs'
 *   new Worker(new URL(`./${name}`, import.meta.url))
 *
 * Because the filename is computed, Rollup cannot statically detect it and
 * never emits the asset — so the built app requests a file that is not there.
 * With the SPA rewrite in vercel.json that 404 comes back as index.html, the
 * worker parses HTML as JavaScript and dies, and every GeoJSON source silently
 * stops loading: basemap fine, zero markers, zero errors in the console.
 *
 * Copying the worker next to the entry chunk is what makes the runtime lookup
 * resolve. The worker is a module that statically imports maplibre-gl-shared,
 * so that file has to travel with it — emitting only the worker gets you a
 * worker that boots and then dies on its first import, with the exact same
 * silent symptom.
 */
const MAPLIBRE_WORKER_FILES = [
  'maplibre-gl-worker.mjs',
  'maplibre-gl-shared.mjs',
]

function maplibreWorkerAsset() {
  let assetsDir = 'assets'
  return {
    name: 'maplibre-worker-asset',
    apply: 'build',
    configResolved(config) {
      assetsDir = config.build.assetsDir
    },
    generateBundle() {
      for (const file of MAPLIBRE_WORKER_FILES) {
        const src = require.resolve(`maplibre-gl/dist/${file}`)
        this.emitFile({
          type: 'asset',
          fileName: `${assetsDir}/${file}`,
          source: fs.readFileSync(src, 'utf8'),
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), maplibreWorkerAsset()],
  // Same worker problem in dev: pre-bundling flattens maplibre-gl into
  // .vite/deps/ where the sibling worker file does not exist.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
