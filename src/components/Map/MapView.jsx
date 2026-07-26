import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MODES, CONTAMINATION_LAYERS, LIFE_LAYERS } from '../../data/constants';
import styles from './MapView.module.css';

// CyberDark Map Style
const DARK_STYLE = {
  version: 8,
  name: 'CyberDark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© CARTO',
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

export default function MapView({ mode, activeLayers, data, onItemClick }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const sourcesAdded = useRef(new Set());

  const isContamination = mode === MODES.CONTAMINATION;

  // ——— Initialize MapLibre ———
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_STYLE,
      ...INITIAL_VIEW,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    const handleLoad = () => {
      mapRef.current = map;
      setMapLoaded(true);
    };

    if (map.loaded()) {
      handleLoad();
    } else {
      map.on('load', handleLoad);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      sourcesAdded.current.clear();
    };
  }, []);

  // ——— Parse GeoJSON (Pre-calculating glow sizes to avoid WebGL crashes) ———
  const co2GeoJSON = useMemo(() => {
    if (!data?.co2) return null;
    return {
      type: 'FeatureCollection',
      features: data.co2.map(d => {
        const r = Math.max(8, Math.sqrt(d.co2_total_mt) * 0.6);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: { ...d, radius: r, glowRadius: r * 3, _raw: JSON.stringify(d) },
        };
      }),
    };
  }, [data?.co2]);

  const airQualityGeoJSON = useMemo(() => {
    if (!data?.airQuality) return null;
    const features = [];
    data.airQuality.forEach(d => {
      const r = Math.max(6, d.pm25 * 0.3);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: { ...d, radius: r, glowRadius: r * 3, type: 'country', _raw: JSON.stringify(d) },
      });
      if (d.cities) {
        d.cities.forEach(c => {
          const cr = Math.max(4, c.pm25 * 0.15);
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
            properties: { ...c, radius: cr, glowRadius: cr * 3, type: 'city', parentCountry: d.name, _raw: JSON.stringify(c) },
          });
        });
      }
    });
    return { type: 'FeatureCollection', features };
  }, [data?.airQuality]);

  const oceanPlasticGeoJSON = useMemo(() => {
    if (!data?.oceanPlastic) return null;
    return {
      type: 'FeatureCollection',
      features: data.oceanPlastic.map(d => {
        const r = Math.max(10, Math.sqrt(d.tons) * 0.15);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: { ...d, radius: r, glowRadius: r * 4, _raw: JSON.stringify(d) },
        };
      }),
    };
  }, [data?.oceanPlastic]);

  const riversGeoJSON = useMemo(() => {
    if (!data?.rivers) return null;
    return {
      type: 'FeatureCollection',
      features: data.rivers.map(d => {
        const r = d.length_km > 0 ? Math.max(6, Math.sqrt(d.length_km) * 0.2) : 10;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: { ...d, radius: r, glowRadius: r * 2, _raw: JSON.stringify(d) },
        };
      }),
    };
  }, [data?.rivers]);

  const protectedAreasGeoJSON = useMemo(() => {
    if (!data?.protectedAreas) return null;
    return {
      type: 'FeatureCollection',
      features: data.protectedAreas.map(d => {
        const r = Math.max(8, Math.sqrt(d.area_km2) * 0.012);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: { ...d, radius: r, glowRadius: r * 2, statusColor: d.status === 'Protegido' ? '#00ff87' : '#ff6b35', _raw: JSON.stringify(d) },
        };
      }),
    };
  }, [data?.protectedAreas]);

  const addSourceAndLayers = useCallback((sourceId, geojson, layerConfigs) => {
    const map = mapRef.current;
    if (!map || !geojson) return;
    layerConfigs.forEach(l => { if (map.getLayer(l.id)) map.removeLayer(l.id); });
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    map.addSource(sourceId, { type: 'geojson', data: geojson });
    layerConfigs.forEach(l => map.addLayer(l));
    sourcesAdded.current.add(sourceId);
  }, []);

  const removeSourceAndLayers = useCallback((sourceId, layerIds) => {
    const map = mapRef.current;
    if (!map) return;
    layerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    sourcesAdded.current.delete(sourceId);
  }, []);

  // ——— Layers Sync ———
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // CO2 (Red Magma Glow)
    const showCO2 = isContamination && activeLayers.includes(CONTAMINATION_LAYERS.CO2_EMISSIONS);
    if (showCO2 && co2GeoJSON) {
      addSourceAndLayers('co2-source', co2GeoJSON, [
        {
          id: 'co2-glow', type: 'circle', source: 'co2-source',
          paint: {
            'circle-radius': ['get', 'glowRadius'],
            'circle-color': '#ff2d55', 'circle-opacity': 0.3, 'circle-blur': 1
          }
        },
        {
          id: 'co2-core', type: 'circle', source: 'co2-source',
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': '#ffffff', 'circle-opacity': 0.9,
            'circle-stroke-width': 2, 'circle-stroke-color': '#ff2d55'
          }
        }
      ]);
    } else {
      removeSourceAndLayers('co2-source', ['co2-glow', 'co2-core']);
    }

    // AIR QUALITY (Cyan Glow)
    const showAir = isContamination && activeLayers.includes(CONTAMINATION_LAYERS.AIR_QUALITY);
    if (showAir && airQualityGeoJSON) {
      addSourceAndLayers('air-source', airQualityGeoJSON, [
        {
          id: 'air-glow', type: 'circle', source: 'air-source',
          paint: {
            'circle-radius': ['get', 'glowRadius'],
            'circle-color': '#00d4ff', 'circle-opacity': 0.4, 'circle-blur': 1
          }
        },
        {
          id: 'air-core', type: 'circle', source: 'air-source',
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': '#ffffff', 'circle-opacity': 1,
            'circle-stroke-width': 2, 'circle-stroke-color': '#00d4ff'
          }
        }
      ]);
    } else {
      removeSourceAndLayers('air-source', ['air-glow', 'air-core']);
    }

    // PLASTIC (Purple Glow)
    const showPlastic = isContamination && activeLayers.includes(CONTAMINATION_LAYERS.OCEAN_PLASTIC);
    if (showPlastic && oceanPlasticGeoJSON) {
      addSourceAndLayers('plastic-source', oceanPlasticGeoJSON, [
        {
          id: 'plastic-glow', type: 'circle', source: 'plastic-source',
          paint: {
            'circle-radius': ['get', 'glowRadius'],
            'circle-color': '#da70d6', 'circle-opacity': 0.3, 'circle-blur': 1
          }
        },
        {
          id: 'plastic-core', type: 'circle', source: 'plastic-source',
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': '#ffffff', 'circle-opacity': 0.8,
            'circle-stroke-width': 2, 'circle-stroke-color': '#da70d6'
          }
        }
      ]);
    } else {
      removeSourceAndLayers('plastic-source', ['plastic-glow', 'plastic-core']);
    }

    // RIVERS (Cyan Lines/Dots)
    const showRivers = !isContamination && activeLayers.includes(LIFE_LAYERS.RIVERS);
    if (showRivers && riversGeoJSON) {
      addSourceAndLayers('river-source', riversGeoJSON, [
        {
          id: 'river-glow', type: 'circle', source: 'river-source',
          paint: {
            'circle-radius': ['get', 'glowRadius'],
            'circle-color': '#00ffff', 'circle-opacity': 0.3, 'circle-blur': 1
          }
        },
        {
          id: 'river-core', type: 'circle', source: 'river-source',
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': '#ffffff', 'circle-opacity': 1,
            'circle-stroke-width': 2, 'circle-stroke-color': '#00ffff'
          }
        }
      ]);
    } else {
      removeSourceAndLayers('river-source', ['river-glow', 'river-core']);
    }

    // PROTECTED (Emerald Glow)
    const showProtected = !isContamination && activeLayers.includes(LIFE_LAYERS.PROTECTED_AREAS);
    if (showProtected && protectedAreasGeoJSON) {
      addSourceAndLayers('protected-source', protectedAreasGeoJSON, [
        {
          id: 'protected-glow', type: 'circle', source: 'protected-source',
          paint: {
            'circle-radius': ['get', 'glowRadius'],
            'circle-color': ['get', 'statusColor'], 'circle-opacity': 0.3, 'circle-blur': 1
          }
        },
        {
          id: 'protected-core', type: 'circle', source: 'protected-source',
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': '#ffffff', 'circle-opacity': 0.9,
            'circle-stroke-width': 2, 'circle-stroke-color': ['get', 'statusColor']
          }
        }
      ]);
    } else {
      removeSourceAndLayers('protected-source', ['protected-glow', 'protected-core']);
    }

  }, [mapLoaded, mode, activeLayers, isContamination, co2GeoJSON, airQualityGeoJSON, oceanPlasticGeoJSON, riversGeoJSON, protectedAreasGeoJSON, addSourceAndLayers, removeSourceAndLayers]);

  // ——— Interactions ———
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const interactiveLayers = ['co2-core', 'air-core', 'plastic-core', 'river-core', 'protected-core'];

    function onClick(e) {
      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers.filter(id => map.getLayer(id)) });
      if (!features || features.length === 0) return onItemClick(null);

      const f = features[0];
      const p = f.properties;
      const l = f.layer.id;
      
      let iType = '', iIcon = '', iMode = mode;
      if (l === 'co2-core') { iType = 'Emisiones CO₂'; iIcon = 'factory'; }
      else if (l === 'air-core') { iType = p.type === 'city' ? `Ciudad — ${p.parentCountry}` : 'Calidad del Aire'; iIcon = 'wind'; }
      else if (l === 'plastic-core') { iType = 'Plástico Oceánico'; iIcon = 'waves'; }
      else if (l === 'river-core') { iType = 'Río/Fuente Hídrica'; iIcon = 'droplets'; iMode = MODES.LIFE; }
      else if (l === 'protected-core') { iType = p.type || 'Área Protegida'; iIcon = p.icon || 'leaf'; iMode = MODES.LIFE; }

      let parsed = {};
      try { parsed = JSON.parse(p._raw); } catch { parsed = { ...p }; }

      onItemClick({ name: p.name, type: iType, icon: iIcon, mode: iMode, lat: e.lngLat.lat, lng: e.lngLat.lng, data: parsed });
      map.flyTo({ center: [e.lngLat.lng, e.lngLat.lat], zoom: 5, duration: 1500 });
    }

    function onMouseMove(e) {
      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers.filter(id => map.getLayer(id)) });
      setCursorPos({ x: e.point.x, y: e.point.y });
      if (features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        setHoveredItem(features[0].properties);
      } else {
        map.getCanvas().style.cursor = 'grab';
        setHoveredItem(null);
      }
    }

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    return () => { map.off('click', onClick); map.off('mousemove', onMouseMove); };
  }, [mapLoaded, mode, onItemClick]);

  useEffect(() => {
    if (mapRef.current) MapView.flyTo = (lng, lat, zoom = 5) => mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
  }, [mapLoaded]);

  return (
    <div className={styles.mapContainer}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div className={styles.mapOverlay} style={{ boxShadow: 'inset 0 0 150px rgba(0, 0, 0, 0.9), inset 0 0 50px rgba(2, 6, 23, 0.8)' }} />
      
      {hoveredItem && (
        <div className={styles.tooltip} style={{ left: cursorPos.x, top: cursorPos.y }}>
          <div className={styles.tooltipContent}>
            <div className={styles.tooltipName}>{hoveredItem.name}</div>
            {hoveredItem.co2_total_mt && <div className={styles.tooltipValue} style={{ color: '#ff4d4d' }}>{hoveredItem.co2_total_mt} Mt CO₂</div>}
            {hoveredItem.pm25 && !hoveredItem.co2_total_mt && <div className={styles.tooltipValue} style={{ color: '#00d4ff' }}>PM2.5: {hoveredItem.pm25} μg/m³</div>}
            {hoveredItem.tons && <div className={styles.tooltipValue} style={{ color: '#da70d6' }}>{Number(hoveredItem.tons).toLocaleString('es-ES')} ton</div>}
            {hoveredItem.length_km > 0 && <div className={styles.tooltipValue} style={{ color: '#00ffff' }}>{Number(hoveredItem.length_km).toLocaleString('es-ES')} km</div>}
            {hoveredItem.biodiversity_index && !hoveredItem.length_km && <div className={styles.tooltipValue} style={{ color: '#00ff87' }}>Biodiversidad: {hoveredItem.biodiversity_index}/10</div>}
          </div>
          <div className={styles.tooltipArrow} />
        </div>
      )}
    </div>
  );
}

MapView.flyTo = () => {};
