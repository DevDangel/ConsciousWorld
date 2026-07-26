import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MODES, CONTAMINATION_LAYERS, LIFE_LAYERS } from './data/constants';
import { useMapData } from './hooks/useMapData';
import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import MapView from './components/Map/MapView';
import StatsPanel from './components/Stats/StatsPanel';
import Icon from './components/UI/Icons';
import styles from './App.module.css';

export default function App() {
  const [mode, setMode] = useState(MODES.CONTAMINATION);
  const [activeLayers, setActiveLayers] = useState([
    CONTAMINATION_LAYERS.CO2_EMISSIONS,
    CONTAMINATION_LAYERS.AIR_QUALITY,
  ]);
  const [selectedItem, setSelectedItem] = useState(null);
  const { data, loading, error } = useMapData();

  // ——— Mode change ———
  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    setSelectedItem(null);
    // Set default layers for each mode
    if (newMode === MODES.CONTAMINATION) {
      setActiveLayers([CONTAMINATION_LAYERS.CO2_EMISSIONS, CONTAMINATION_LAYERS.AIR_QUALITY]);
    } else {
      setActiveLayers([LIFE_LAYERS.RIVERS, LIFE_LAYERS.PROTECTED_AREAS]);
    }
  }, []);

  // ——— Layer toggle ———
  const handleToggleLayer = useCallback((layerId) => {
    setActiveLayers(prev =>
      prev.includes(layerId)
        ? prev.filter(id => id !== layerId)
        : [...prev, layerId]
    );
  }, []);

  // ——— Item click (from map or search) ———
  const handleItemClick = useCallback((item) => {
    setSelectedItem(item);
    if (item?.mode && item.mode !== mode) {
      setMode(item.mode);
      if (item.mode === MODES.CONTAMINATION) {
        setActiveLayers([CONTAMINATION_LAYERS.CO2_EMISSIONS, CONTAMINATION_LAYERS.AIR_QUALITY, CONTAMINATION_LAYERS.OCEAN_PLASTIC]);
      } else {
        setActiveLayers([LIFE_LAYERS.RIVERS, LIFE_LAYERS.PROTECTED_AREAS]);
      }
    }
  }, [mode]);

  // ——— Search select ———
  const handleSearchSelect = useCallback((item) => {
    handleItemClick(item);
    // Fly to the location
    if (item?.lat && item?.lng) {
      MapView.flyTo(item.lng, item.lat, 5);
    }
  }, [handleItemClick]);

  // ——— Loading state ———
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingContent}>
          <div className={styles.loadingGlobe}>
            <Icon name="globe" size={64} />
          </div>
          <div className={styles.loadingTitle}>ConsciousWorld</div>
          <div className={styles.loadingBar}>
            <div className={styles.loadingBarFill} />
          </div>
          <div className={styles.loadingText}>Cargando datos del planeta...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {/* Map (fullscreen base) */}
      <MapView
        mode={mode}
        activeLayers={activeLayers}
        data={data}
        onItemClick={handleItemClick}
        selectedItem={selectedItem}
      />

      {/* Top Bar */}
      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        data={data}
        onSearchSelect={handleSearchSelect}
      />

      {/* Left Sidebar */}
      <Sidebar
        mode={mode}
        activeLayers={activeLayers}
        onToggleLayer={handleToggleLayer}
      />

      {/* Right Stats Panel */}
      <AnimatePresence>
        {selectedItem && (
          <StatsPanel
            mode={mode}
            selectedItem={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
