# ConsciousWorld

Visualización interactiva del estado del planeta sobre un **globo 3D**. Dos modos
excluyentes — **Contaminación** y **Vida** — que combinan un coropleta por país con
marcadores puntuales para lo que no es país-céntrico. La calidad del aire se ve **en
movimiento**: miles de partículas llevadas por el viento real, teñidas por el PM2.5
del aire que atraviesan.

## Stack

React 19 · Vite 8 · MapLibre GL 6 · Recharts · Framer Motion · CSS Modules

## Puesta en marcha

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run lint     # oxlint
npm run data:air # (opcional) refresca el respaldo local con datos NASA de hoy
```

No requiere claves de API ni variables de entorno. En `npm run dev` la ruta
`/api/air-field` también funciona (el servidor de Vite ejecuta la misma función que
Vercel), así que en local ya ves el viento de hoy de la NASA.

## Cómo está organizado

```
api/
  air-field.js            función de Vercel: viento + PM2.5 de la NASA, con caché
  _geos-cf.js             descarga y lectura de NASA GEOS-CF (compartido)
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
| Contaminación | Emisiones de CO₂ (Mt/año) | **Calidad del aire** (viento + PM2.5, activa al abrir), plástico oceánico |
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
| `air-field.json` | Respaldo: cuadrícula global de viento U/V (+ PM2.5) | NOAA GFS (muestra 2014) / NASA GEOS-CF | `npm run data:air` |
| `/api/air-field` | **En vivo:** viento y PM2.5 de la última hora | NASA GEOS-CF | función de Vercel, caché 3 h |

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

## Calidad del aire en movimiento

Una sola capa, "Calidad del Aire (PM2.5)", reúne tres cosas: las partículas de viento,
la neblina de PM2.5 debajo y los 67 puntos de medición (clic para ver su detalle). Si
`air-field.json` no carga, la misma capa vuelve a la niebla estática de antes.

`src/components/Map/AirFlowLayer.jsx` dibuja las partículas en un `<canvas>` 2D encima
del canvas de MapLibre (con `pointer-events: none`, así que hover y clic siguen
funcionando). Cada partícula vive en lng/lat, avanza con el viento interpolado
bilinealmente (`src/utils/airField.js`) y se proyecta al globo con `map.project`.

Por qué se ven corrientes y no puntos:
- Cada partícula recuerda sus últimas 14 posiciones (una cada 5 frames) y las dibuja
  como una estela que va de opaca en la cabeza a transparente en la cola.
- El canvas **se borra por completo en cada frame**. El truco habitual de desvanecer el
  frame anterior (`destination-in`) nunca llega a cero: el redondeo a 8 bits deja cada
  estela vieja atascada en ~5 % de opacidad para siempre (medido: 14/255 tras 100, 300
  y 600 frames), y en un minuto esos fantasmas cubren el globo de rayones grises que
  tapan los continentes.
- Cada partícula vive 80–180 frames y avanza ~0,5 px por frame por cada 10 m/s
  (unos 30 px por segundo): una deriva que el ojo puede seguir.
- Con viento casi nulo (< 0,6 m/s) no se dibujan: el aire quieto se ve quieto, no como
  garabatos.
- El campo de viento pasa por un suavizado ligero (`smoothPasses`) que quita los
  remolinos de una celda que trae el submuestreo de 0,25° a 1°.
- Nacen en píxeles aleatorios **de la pantalla** que caen sobre el planeta, no en
  lat/lng aleatorias: así no se amontonan en el horizonte del globo.
- Mientras la cámara se mueve, el canvas se limpia y se pausa; al soltar, renacen en
  la nueva vista.
- Si un frame cuesta más de ~8 ms, anima menos partículas; en equipos rápidos vuelve a
  subir. Un portátil lento ve un viento más ralo en vez de tirones.

Los colores (`AIR_FLOW.buckets`) siguen la guía de la OMS y son deliberadamente
apagados y semitransparentes: gris azulado tenue por debajo de 15 µg/m³, y arena,
ámbar, coral y rosa hasta 75 y más. Debajo se pinta la misma magnitud como una neblina
que nunca pasa de ~25 % de opacidad (`airOverlay.js`), una imagen Web Mercator que
MapLibre envuelve en el globo. Velocidad, estela, densidad y colores se ajustan en
`AIR_FLOW`, en `src/data/constants.js`.

### Datos del viento y del color: NASA GEOS-CF

El viento y el PM2.5 vienen de **GEOS-CF** (Goddard Earth Observing System, Composition
Forecast), el modelo global de composición atmosférica de la NASA. Se publica cada hora,
a 0,25°, en un servidor OPeNDAP público sin clave ni login. Viento y contaminación salen
del mismo modelo, así que el aire que se mueve y lo que carga son coherentes entre sí.

```
Navegador ──► /api/air-field ──► caché de Vercel (3 h) ──► NASA GEOS-CF
                  │ si falla
                  └──► /data/air-field.json (respaldo incluido)
```

- **`api/air-field.js`** es una función de Vercel. Lee de la NASA la última hora de
  `u`, `v` (colección `met_tavg_1hr_glo_L1440x721_slv`, capa más baja del modelo) y
  `pm25_rh35` (colección `aqc_tavg_1hr_glo_L1440x721_slv`, µg/m³), submuestreados a 1°
  (181 × 360), y los devuelve en el formato de `air-field.json`. La NASA tarda ~0,5–2 s.
- **Caché:** `s-maxage=10800, stale-while-revalidate=86400`. Vercel guarda la respuesta
  3 horas y después sigue sirviendo la copia anterior mientras trae la nueva por detrás:
  la NASA recibe ~8 peticiones al día, entre quien entre, y nadie espera.
- **Si falla** (NASA caída, formato cambiado), la función responde 502 con un mensaje
  claro (visible en Vercel → Logs) y la app usa `public/data/air-field.json`. La leyenda
  siempre dice qué fuente y qué hora está mostrando.
- **`api/_geos-cf.js`** tiene la lógica compartida: descarga, lector del formato ASCII
  de GrADS (verificado contra el servidor real) y relleno de huecos. El guion bajo evita
  que Vercel lo publique como función propia.
- **`vercel.json`** excluye `/api/` de la reescritura SPA; sin eso, la ruta devolvería
  `index.html`.

El respaldo incluido es una **muestra histórica real**: viento a 10 m del modelo GFS de
la NOAA, 1°, del 31-ene-2014 (convertida a JSON por el proyecto
[earth](https://github.com/cambecc/earth), MIT). Para que el respaldo también sea
reciente:

```bash
npm run data:air   # escribe public/data/air-field.json con la NASA de ahora (~2 s)
```

De dónde sale el color de cada partícula:
- **Con PM2.5 en la cuadrícula** (NASA GEOS-CF): el valor del modelo en ese punto, que
  ya incluye el transporte de la contaminación.
- **Sin él** (la muestra de 2014): los 67 puntos de `air-quality.json` (en vivo si Open-Meteo
  responde) se sueltan en el campo de viento y se arrastran viento abajo
  (`disperse` en `airField.js`). Es un **trazador ilustrativo**, no un modelo de calidad
  del aire, y la leyenda lo dice así.

Al pasar el cursor, una pastilla abajo muestra coordenadas, viento (m/s, km/h y de dónde
sopla) y PM2.5 en ese punto.

## Notas de implementación

- **Globo:** `projection: { type: 'globe' }` en el estilo de `MapView.jsx`, con halo de
  atmósfera (`sky`). El zoom inicial se calcula con el tamaño de la pantalla para que el
  planeta entero quepa en un móvil y en un monitor 4K.

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

`vercel.json` reescribe todo a `index.html` (SPA) salvo `/api/`. El build es estático
más una función (`api/air-field.js`, máx. 30 s) que Vercel detecta sola; no hay que
configurar nada en el panel.
