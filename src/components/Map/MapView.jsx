import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MODES,
  CONTAMINATION_LAYERS,
  LIFE_LAYERS,
  CHOROPLETH,
  choroplethExpression,
  NO_DATA_COLOR,
  FOG,
  fogColor,
  fogRadius,
  fogWeight,
} from '../../data/constants';
import styles from './MapView.module.css';

// CyberDark Map Style
const DARK_STYLE = {
  version: 8,
  name: 'CyberDark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png?key=cb1_2nzw_1_dc6faee3f8d3740b180a82ce',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png?key=cb1_2nzw_1_dc6faee3f8d3740b180a82ce',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png?key=cb1_2nzw_1_dc6faee3f8d3740b180a82ce',
      ],
      tileSize: 256,
      attribution: '© <a href="https://carto.com/attributions">CARTO</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 18,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0f172a' },
    },
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      paint: {
        'raster-brightness-max': 1,
        'raster-saturation': -0.3,
        'raster-contrast': 0.1,
      },
    },
  ],
};

const INITIAL_VIEW = {
  center: [0, 20],
  zoom: 1.8,
  maxZoom: 10,
  minZoom: 1,
};

// Bottom-to-top paint order. Every insertion is anchored against this list so
// the choropleth can never end up on top of the markers, whatever order the
// layers happen to be toggled in.
const LAYER_ORDER = [
  'countries-nodata',
  'countries-fill',
  'countries-line',
  'air-fog',
  'plastic-fog',
  'protected-fog',
  'lake-fog',
  'river-glow',
  'river-line',
  'air-core',
  'plastic-core',
  'river-core',
  'protected-core',
];

// Layers that respond to hover / click, highest priority first.
const INTERACTIVE = [
  'air-core', 'plastic-core', 'river-core', 'protected-core', 'river-line',
  'countries-fill',
];

function addLayerOrdered(map, layer) {
  const idx = LAYER_ORDER.indexOf(layer.id);
  const before = LAYER_ORDER.slice(idx + 1).find(id => map.getLayer(id));
  map.addLayer(layer, before);
}

/**
 * Turn a rendered feature into the shape the tooltip and the stats panel both
 * consume, so hovering and clicking can never describe the same thing
 * differently.
 */
function describeFeature(feature, mode) {
  const p = feature.properties;
  const layerId = feature.layer.id;
  const parse = (key, fallback) => {
    try { return JSON.parse(p[key]); } catch { return fallback; }
  };

  switch (layerId) {
    case 'air-core':
      return {
        name: p.name,
        kind: p.kind === 'city' ? 'city' : 'air',
        type: p.kind === 'city' ? `Ciudad — ${p.parentCountry}` : 'Calidad del Aire',
        icon: p.kind === 'city' ? 'city' : 'wind',
        mode: MODES.CONTAMINATION,
        metric: { label: 'PM2.5', value: `${Number(p.pm25).toFixed(1)} μg/m³`, color: '#00d4ff' },
        data: parse('_raw', p),
      };
    case 'plastic-core':
      return {
        name: p.name,
        kind: 'plastic',
        type: 'Plástico Oceánico',
        icon: 'waves',
        mode: MODES.CONTAMINATION,
        metric: { label: 'Plástico', value: `${Number(p.tons).toLocaleString('es-ES')} ton`, color: '#da70d6' },
        data: parse('_raw', p),
      };
    case 'river-core':
    case 'river-line':
      return {
        name: p.name,
        kind: 'river',
        type: 'Río/Fuente Hídrica',
        icon: 'droplets',
        mode: MODES.LIFE,
        metric: p.length_km > 0
          ? { label: 'Longitud', value: `${Number(p.length_km).toLocaleString('es-ES')} km`, color: '#00ffff' }
          : null,
        data: parse('_raw', p),
      };
    case 'protected-core':
      return {
        name: p.name,
        kind: 'protectedArea',
        type: p.areaType || 'Área Protegida',
        icon: p.icon || 'leaf',
        mode: MODES.LIFE,
        metric: { label: 'Biodiversidad', value: `${p.biodiversity_index}/10`, color: '#00ff87' },
        data: parse('_raw', p),
      };
    case 'countries-fill':
      return mode === MODES.CONTAMINATION
        ? {
          name: p.name,
          kind: 'co2',
          type: 'Emisiones CO₂',
          icon: 'factory',
          mode: MODES.CONTAMINATION,
          metric: { label: 'CO₂', value: `${Number(p.co2).toLocaleString('es-ES')} Mt`, color: '#ff4d4d' },
          data: parse('_co2', null),
        }
        : {
          name: p.name,
          kind: 'coverage',
          type: 'Territorio Protegido',
          icon: 'map',
          mode: MODES.LIFE,
          metric: { label: 'Protegido', value: `${p.coverage}%`, color: '#00ff87' },
          data: parse('_coverage', null),
        };
    default:
      return null;
  }
}

function MapView({ mode, activeLayers, data, onItemClick }, ref) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hovered, setHovered] = useState(null);
  const sourceData = useRef(new Map());

  const isContamination = mode === MODES.CONTAMINATION;

  // Expose camera control to the parent instead of hanging a mutable static
  // method off the component function.
  useImperativeHandle(ref, () => ({
    flyTo(lng, lat, zoom = 5) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
    },
  }), []);

  // ——— Initialize MapLibre ———
  useEffect(() => {
    const sources = sourceData.current;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_STYLE,
      ...INITIAL_VIEW,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('error', e => console.error('[maplibre]', e.error?.message || e));

    const handleLoad = () => {
      mapRef.current = map;
      // Debug handle: lets you inspect layers/sources from the console with
      // __map.getStyle(). Dev only, never shipped.
      if (import.meta.env.DEV) window.__map = map;
      setMapLoaded(true);
    };
    map.on('load', handleLoad);

    return () => {
      // Force the layer effect to re-run against the next map instance;
      // without this, a StrictMode remount leaves mapLoaded stuck at true
      // while mapRef points at a fresh, empty map.
      setMapLoaded(false);
      mapRef.current = null;
      sources.clear();
      map.remove();
    };
  }, []);

  // ——— GeoJSON builders ———
  // No precomputed radii any more: the fog reads the raw measurement and the
  // anchor dots are a fixed size.
  const airQualityGeoJSON = useMemo(() => {
    if (!data?.airQuality) return null;
    const features = [];
    data.airQuality.forEach(d => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: { ...d, cities: undefined, kind: 'country', _raw: JSON.stringify(d) },
      });
      d.cities?.forEach(c => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          properties: { ...c, kind: 'city', parentCountry: d.name, _raw: JSON.stringify(c) },
        });
      });
    });
    return { type: 'FeatureCollection', features };
  }, [data?.airQuality]);

  const oceanPlasticGeoJSON = useMemo(() => {
    if (!data?.oceanPlastic) return null;
    return {
      type: 'FeatureCollection',
      features: data.oceanPlastic.map(d => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: { ...d, _raw: JSON.stringify(d) },
      })),
    };
  }, [data?.oceanPlastic]);

  // Only the water bodies with no centerline in Natural Earth: Baikal and the
  // Great Lakes are lakes, so they cannot be drawn as a course.
  const lakesGeoJSON = useMemo(() => {
    if (!data?.rivers) return null;
    const drawn = new Set(
      (data.riverCourses?.features ?? []).map(f => f.properties.name)
    );
    const lakes = data.rivers.filter(d => !drawn.has(d.name));
    const maxSide = Math.sqrt(Math.max(...lakes.map(d => d.basin_km2), 1));
    return {
      type: 'FeatureCollection',
      features: lakes.map(d => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: {
          ...d,
          countries: undefined,
          fogSize: +(Math.sqrt(d.basin_km2) / maxSide).toFixed(3),
          _raw: JSON.stringify(d),
        },
      })),
    };
  }, [data?.rivers, data?.riverCourses]);

  const protectedAreasGeoJSON = useMemo(() => {
    if (!data?.protectedAreas) return null;
    // Square-rooted so the Amazon does not flatten every other reserve to a dot.
    const maxSide = Math.sqrt(Math.max(...data.protectedAreas.map(d => d.area_km2)));
    return {
      type: 'FeatureCollection',
      features: data.protectedAreas.map(d => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: {
          ...d,
          areaType: d.type,
          fogSize: +(Math.sqrt(d.area_km2) / maxSide).toFixed(3),
          statusColor: d.status === 'Protegido' ? '#00ff87' : '#ff6b35',
          _raw: JSON.stringify(d),
        },
      })),
    };
  }, [data?.protectedAreas]);

  /**
   * Add or update a source and its layers. The source is reused via setData
   * when the payload is unchanged, so toggling a mode no longer re-uploads
   * every polygon to the worker.
   */
  const syncLayers = useCallback((sourceId, geojson, visible, layerConfigs) => {
    const map = mapRef.current;
    if (!map) return;
    const ids = layerConfigs.map(l => l.id);

    if (!visible || !geojson) {
      ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      sourceData.current.delete(sourceId);
      return;
    }

    const existing = map.getSource(sourceId);
    if (!existing) {
      map.addSource(sourceId, { type: 'geojson', data: geojson });
    } else if (sourceData.current.get(sourceId) !== geojson) {
      existing.setData(geojson);
    }
    sourceData.current.set(sourceId, geojson);

    layerConfigs.forEach(l => {
      if (map.getLayer(l.id)) map.removeLayer(l.id);
      addLayerOrdered(map, l);
    });
  }, []);

  /** The gas cloud. This is the whole visual — nothing is drawn on top of it. */
  const fogLayer = (id, source, spec) => ({
    id, type: 'heatmap', source,
    paint: {
      'heatmap-weight': fogWeight(spec),
      'heatmap-intensity': spec.intensity,
      'heatmap-radius': fogRadius(spec),
      'heatmap-color': fogColor(spec),
      'heatmap-opacity': 1,
    },
  });

  /**
   * Invisible click target under the cursor. A heatmap layer cannot be
   * queried, so each point still needs a circle to hit — but it is fully
   * transparent: the cloud is the only thing anyone sees.
   */
  const hitLayer = (id, source, radius = 14) => ({
    id, type: 'circle', source,
    paint: { 'circle-radius': radius, 'circle-color': '#000000', 'circle-opacity': 0 },
  });

  /**
   * The actual river course, from Natural Earth centerlines. Two passes: a
   * wide blurred stroke underneath for the glow, a crisp thin one on top.
   */
  const courseLayers = (source) => [
    {
      id: 'river-glow', type: 'line', source,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#00d4ff',
        'line-opacity': 0.35,
        'line-blur': 4,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 5, 9, 9, 20],
      },
    },
    {
      id: 'river-line', type: 'line', source,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#7ce9ff',
        'line-opacity': 0.95,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.9, 5, 2.2, 9, 5],
      },
    },
  ];

  // ——— Layer sync ———
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // CHOROPLETH — CO2 per country (contamination) or protected share (life).
    // CO2 lives here rather than as circles, which is what stops it being
    // buried under the air-quality markers sitting on the same centroid.
    const scale = isContamination ? CHOROPLETH.co2 : CHOROPLETH.coverage;
    const showChoropleth = activeLayers.includes(
      isContamination ? CONTAMINATION_LAYERS.CO2_EMISSIONS : LIFE_LAYERS.PROTECTED_COVERAGE
    );
    syncLayers('countries-source', data?.countries, showChoropleth, [
      {
        // Countries the source has no figure for. Without this they stay black
        // and read as "clean" instead of "not measured".
        id: 'countries-nodata', type: 'fill', source: 'countries-source',
        filter: ['!', ['has', scale.property]],
        paint: { 'fill-color': NO_DATA_COLOR, 'fill-opacity': 0.45 },
      },
      {
        id: 'countries-fill', type: 'fill', source: 'countries-source',
        filter: ['has', scale.property],
        paint: {
          'fill-color': choroplethExpression(scale),
          'fill-opacity': isContamination ? 0.55 : 0.5,
        },
      },
      {
        id: 'countries-line', type: 'line', source: 'countries-source',
        filter: ['has', scale.property],
        paint: {
          'line-color': choroplethExpression(scale),
          'line-width': 0.8,
          'line-opacity': 0.9,
        },
      },
    ]);

    // AIR — warm haze. Cyan read as "cool and clean", the opposite of what a
    // PM2.5 reading means.
    syncLayers(
      'air-source', airQualityGeoJSON,
      isContamination && activeLayers.includes(CONTAMINATION_LAYERS.AIR_QUALITY),
      [
        fogLayer('air-fog', 'air-source', FOG.air),
        hitLayer('air-core', 'air-source'),
      ]
    );

    // PLASTIC — violet haze, kept distinct from the air fog because it is a
    // different phenomenon living out at sea.
    syncLayers(
      'plastic-source', oceanPlasticGeoJSON,
      isContamination && activeLayers.includes(CONTAMINATION_LAYERS.OCEAN_PLASTIC),
      [
        fogLayer('plastic-fog', 'plastic-source', FOG.plastic),
        hitLayer('plastic-core', 'plastic-source'),
      ]
    );

    // Rivers and protected areas are not emissions, so they get no fog — just
    // clean hollow markers.
    const showRivers = !isContamination && activeLayers.includes(LIFE_LAYERS.RIVERS);

    syncLayers('course-source', data?.riverCourses, showRivers, courseLayers('course-source'));

    // Baikal and the Great Lakes have no centerline — they are lakes. They keep
    // a ring marker so they do not vanish from the map.
    syncLayers('river-source', lakesGeoJSON, showRivers, [
      fogLayer('lake-fog', 'river-source', FOG.lake),
      hitLayer('river-core', 'river-source'),
    ]);

    syncLayers(
      'protected-source', protectedAreasGeoJSON,
      !isContamination && activeLayers.includes(LIFE_LAYERS.PROTECTED_AREAS),
      [
        fogLayer('protected-fog', 'protected-source', FOG.protected),
        hitLayer('protected-core', 'protected-source'),
      ]
    );
  }, [
    mapLoaded, activeLayers, isContamination, data?.countries,
    airQualityGeoJSON, oceanPlasticGeoJSON, lakesGeoJSON, protectedAreasGeoJSON,
    data?.riverCourses,
    syncLayers,
  ]);

  // ——— Interactions ———
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const live = () => INTERACTIVE.filter(id => map.getLayer(id));

    function onClick(e) {
      const features = map.queryRenderedFeatures(e.point, { layers: live() });
      if (!features.length) return onItemClick(null);

      const described = describeFeature(features[0], mode);
      if (!described?.data) return onItemClick(null);

      const [lng, lat] = features[0].geometry.type === 'Point'
        ? features[0].geometry.coordinates
        : [e.lngLat.lng, e.lngLat.lat];

      onItemClick({ ...described, lat, lng });
      map.flyTo({ center: [lng, lat], zoom: 5, duration: 1500 });
    }

    // Hover state is written at most once per frame; the raw mousemove stream
    // would otherwise re-render this component on every pixel of travel.
    let frame = null;
    let pending = null;

    function flush() {
      frame = null;
      const e = pending;
      pending = null;
      if (!e) return;
      const features = map.queryRenderedFeatures(e.point, { layers: live() });
      const described = features.length ? describeFeature(features[0], mode) : null;
      map.getCanvas().style.cursor = described ? 'pointer' : 'grab';
      setHovered(described ? { ...described, x: e.point.x, y: e.point.y } : null);
    }

    function onMouseMove(e) {
      pending = e;
      frame ??= requestAnimationFrame(flush);
    }

    function onMouseOut() {
      setHovered(null);
    }

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseOut);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('mouseout', onMouseOut);
    };
  }, [mapLoaded, mode, onItemClick]);

  return (
    <div className={styles.mapContainer}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div
        className={styles.mapOverlay}
        style={{ boxShadow: 'inset 0 0 150px rgba(0, 0, 0, 0.9), inset 0 0 50px rgba(2, 6, 23, 0.8)' }}
      />

      {hovered && (
        <div className={styles.tooltip} style={{ left: hovered.x, top: hovered.y }}>
          <div className={styles.tooltipContent}>
            <div className={styles.tooltipName}>{hovered.name}</div>
            {hovered.metric && (
              <div className={styles.tooltipValue} style={{ color: hovered.metric.color }}>
                {hovered.metric.label}: {hovered.metric.value}
              </div>
            )}
          </div>
          <div className={styles.tooltipArrow} />
        </div>
      )}
    </div>
  );
}

export default forwardRef(MapView);
