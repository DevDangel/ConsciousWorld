import { useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MODES } from './data/constants';
import { useMapData } from './hooks/useMapData';
import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import MapView from './components/Map/MapView';
import StatsPanel from './components/Stats/StatsPanel';
import IntroModal from './components/Intro/IntroModal';
import Icon from './components/UI/Icons';
import styles from './App.module.css';

// Every mode opens on a bare black planet. Nothing is drawn until the user
// switches a layer on; the idle toggles pulse to say they are waiting.
const DEFAULT_LAYERS = {
  [MODES.CONTAMINATION]: [],
  [MODES.LIFE]: [],
};

export default function App() {
  const [mode, setMode] = useState(MODES.CONTAMINATION);
  const [activeLayers, setActiveLayers] = useState(DEFAULT_LAYERS[MODES.CONTAMINATION]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [introAccepted, setIntroAccepted] = useState(false);
  const { data, loading, error, live, retry } = useMapData();
  const mapRef = useRef(null);

  // ——— Mode change ———
  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    setSelectedItem(null);
    setActiveLayers(DEFAULT_LAYERS[newMode]);
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
      setActiveLayers(DEFAULT_LAYERS[item.mode]);
    }
  }, [mode]);

  // ——— Search select ———
  const handleSearchSelect = useCallback((item) => {
    handleItemClick(item);
    if (item?.lat != null && item?.lng != null) {
      mapRef.current?.flyTo(item.lng, item.lat, 5);
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

  // ——— Error state ———
  if (error) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingContent}>
          <div className={styles.errorIcon}>
            <Icon name="alert" size={56} />
          </div>
          <div className={styles.errorTitle}>No se pudieron cargar los datos</div>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.retryBtn} onClick={retry}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {/* Manifesto — sits between the loading screen and the map */}
      <AnimatePresence>
        {!introAccepted && <IntroModal onAccept={() => setIntroAccepted(true)} />}
      </AnimatePresence>

      {/* Map (fullscreen base) */}
      <MapView
        ref={mapRef}
        mode={mode}
        activeLayers={activeLayers}
        data={data}
        onItemClick={handleItemClick}
      />

      {/* Top Bar */}
      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        data={data}
        onSearchSelect={handleSearchSelect}
        live={live}
      />

      {/* Left Sidebar */}
      <Sidebar
        mode={mode}
        activeLayers={activeLayers}
        onToggleLayer={handleToggleLayer}
        introAccepted={introAccepted}
      />

      {/* Right Stats Panel */}
      <AnimatePresence>
        {selectedItem && (
          <StatsPanel
            selectedItem={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
