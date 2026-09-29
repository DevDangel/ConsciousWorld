# ConsciousWorld

Visualización interactiva del estado del planeta sobre un mapa mundial. Dos modos
excluyentes — **Contaminación** y **Vida** — que combinan un coropleta por país con
marcadores puntuales para lo que no es país-céntrico.

## Stack

React 19 · Vite 8 · MapLibre GL 6 · Recharts · Framer Motion · CSS Modules

## Puesta en marcha

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run lint     # oxlint
```

No requiere claves de API ni variables de entorno.

## Cómo está organizado

```
src/
  App.jsx                 estado global: modo, capas activas, selección
  hooks/useMapData.js     carga los datasets y hace el join por ISO-3
  data/constants.js       modos, capas, escalas de color del coropleta
  components/
    Map/MapView.jsx       MapLibre imperativo; coropleta + marcadores
    TopBar/               logo, cambio de modo, buscador
    Sidebar/              toggles de capa, estadísticas, leyenda
    Stats/StatsPanel.jsx  panel de detalle (despacha por `kind`)
```

### Modos y capas

| Modo | Coropleta (relleno) | Marcadores |
|---|---|---|
| Contaminación | Emisiones de CO₂ (Mt/año) | Calidad del aire PM2.5, plástico oceánico |
| Vida | Territorio protegido (%) | Ríos, áreas protegidas |

El CO₂ y la cobertura protegida se pintan como relleno de país precisamente porque
son métricas nacionales; usarlos como círculos los dejaba apilados sobre el mismo
centroide que la capa de aire.

## Datos

Todo vive en `public/data/` y se sirve estático.

| Archivo | Contenido | Fuente | Generado |
|---|---|---|---|
| `contamination/co2-emissions.json` | **172 países**: total, per cápita, sectores, serie 2014-2023 | Banco Mundial | `npm run data:refresh` |
| `life/protected-coverage.json` | **177 países**, % territorio protegido | Banco Mundial | `npm run data:refresh` |
| `countries.geojson` | 184 países, geometría simplificada | Natural Earth | a mano (ver abajo) |
| `contamination/air-quality.json` | 30 países + 37 ciudades, PM2.5 | WHO (línea base) | a mano |
| `contamination/ocean-plastic.json` | 15 zonas de acumulación | UNEP | a mano |
| `life/rivers.json` | 16 ríos y cuerpos de agua | — | a mano |
| `life/protected-areas.json` | 20 áreas protegidas | UNEP-WCMC | a mano |

### Actualizar los datos por país

```bash
npm run data:refresh
```

Descarga once indicadores de la [API abierta del Banco Mundial](https://api.worldbank.org/v2)
—sin API key, con CORS abierto— y reescribe los dos primeros archivos de la tabla.
Cada uno lleva un bloque `_meta` con los ids de indicador, la URL, la fecha de
descarga y la fecha de actualización del Banco Mundial, de modo que **cualquier
número del mapa se puede rastrear hasta una consulta que puedes volver a ejecutar**.

Se ejecuta a mano y no en cada carga de página: estos indicadores se actualizan una
vez al año, así que pedirlos en vivo añadiría latencia y un punto de fallo en runtime
a datos que casi nunca cambian.

Detalles del script:
- Los nombres en español salen de `Intl.DisplayNames`, no de una tabla a mano.
- Las coordenadas son el centroide del polígono más grande de cada país. Un centro
  de *bounding box* dejaría a Estados Unidos en el Pacífico por Alaska y Hawái.
- El cruce contra `countries.geojson` descarta gratis los agregados regionales del
  Banco Mundial (`European Union`, `Africa Eastern and Southern`...), porque ninguno
  tiene polígono de país.
- Los años sin dato reportado se omiten de la serie: no hay interpolación.

**PM2.5 en vivo:** al arrancar, la app consulta la API de calidad del aire de
[Open-Meteo](https://open-meteo.com/) con las 67 coordenadas y sustituye los valores
estáticos. Si falla, cae a la línea base sin romper nada; el indicador de la barra
superior dice cuál de las dos está activa.

> ℹ️ Los países sin dato en la fuente se pintan en **gris neutro**, nunca en un color
> de la escala. En un coropleta el vacío comunica: un país negro junto a China en rojo
> se lee como "aquí no contaminan", y eso sería falso. La leyenda incluye la entrada
> "Sin datos en la fuente".

### Regenerar el GeoJSON

`countries.geojson` viene de Natural Earth y pesa ~14 MB en crudo. Se simplifica
(Douglas-Peucker, tolerancia 0.05°, agujeros y microislas descartados) hasta ~0.8 MB,
que es indistinguible a zoom mundial. Natural Earth marca el ISO de Francia y Noruega
como `-99`, así que el preprocesado los parchea por nombre o el join los perdería.

## Notas de implementación

- **El worker de MapLibre necesita dos parches en `vite.config.js`**, uno por entorno.
  MapLibre 6 procesa todo el GeoJSON en un web worker que vive en un archivo aparte.
  Si ese archivo no se resuelve, el mapa base se ve perfecto y **no se dibuja ni un
  marcador, sin ningún error en consola** — el síntoma más engañoso del proyecto.
  - **dev:** `optimizeDeps.exclude: ['maplibre-gl']`. El pre-bundling aplana la
    librería en `.vite/deps/`, donde el archivo hermano del worker no existe → 404.
  - **build:** el plugin `maplibreWorkerAsset`. MapLibre calcula el nombre del worker
    en runtime, así que Rollup no puede detectarlo estáticamente y nunca lo emite.
    Hay que copiar **`maplibre-gl-worker.mjs` y `maplibre-gl-shared.mjs`**: el worker
    importa el segundo, y emitir solo el primero da un worker que arranca y muere en
    su primer import, con el mismo síntoma silencioso.

  Con la reescritura SPA de `vercel.json`, esos 404 vuelven como `index.html` con
  código 200, así que ni siquiera aparecen como error de red.
- El orden de pintado se ancla contra `LAYER_ORDER` en `MapView.jsx`, así que el
  coropleta nunca puede acabar por encima de los marcadores sea cual sea el orden en
  que se activen las capas.
- El hover se escribe como máximo una vez por frame (`requestAnimationFrame`); el
  stream crudo de `mousemove` re-renderizaba en cada píxel.

## Despliegue

`vercel.json` reescribe todo a `index.html` (SPA). El build es estático, sin backend.
