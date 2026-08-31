import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MODES,
  CONTAMINATION_LAYER_CONFIG,
  LIFE_LAYER_CONFIG,
  GLOBAL_STATS,
  CHOROPLETH,
  NO_DATA_COLOR,
  CONTAMINATION_LAYERS,
  LIFE_LAYERS,
} from '../../data/constants';
import AnimatedCounter from '../UI/AnimatedCounter';
import Icon from '../UI/Icons';
import FilterHint from './FilterHint';
import styles from './Sidebar.module.css';

export default function Sidebar({ mode, activeLayers, onToggleLayer, introAccepted = true }) {
  const [isOpen, setIsOpen] = useState(true);
  const [interactedModes, setInteractedModes] = useState({
    [MODES.CONTAMINATION]: false,
    [MODES.LIFE]: false,
  });

  const isContamination = mode === MODES.CONTAMINATION;
  const layers = isContamination ? CONTAMINATION_LAYER_CONFIG : LIFE_LAYER_CONFIG;
  const stats = isContamination ? GLOBAL_STATS.contamination : GLOBAL_STATS.life;

  const handleToggle = useCallback((layerId) => {
    setInteractedModes(prev => ({ ...prev, [mode]: true }));
    onToggleLayer(layerId);
  }, [mode, onToggleLayer]);

  const showHint = introAccepted && isOpen && !interactedModes[mode] && activeLayers.length === 0;

  // The legend follows whichever surface layer is actually painted, not the
  // mode — otherwise it explains a choropleth the user has switched off.
  const choroplethOn = activeLayers.includes(
    isContamination ? CONTAMINATION_LAYERS.CO2_EMISSIONS : LIFE_LAYERS.PROTECTED_COVERAGE
  );
  const scale = choroplethOn
    ? (isContamination ? CHOROPLETH.co2 : CHOROPLETH.coverage)
    : null;

  return (
    <>
      {/* Toggle button */}
      <button
        className={isOpen ? styles.toggleBtnOpen : styles.toggleBtn}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Cerrar panel' : 'Abrir panel'}
      >
        <Icon name={isOpen ? 'chevronLeft' : 'chevronRight'} size={14} />
      </button>

      {/* Persistent blinking filter hint */}
      <AnimatePresence>
        {showHint && (
          <FilterHint mode={mode} />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            className={styles.sidebar}
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Layer Controls */}
            <div>
              <h2 className={isContamination ? styles.sectionTitleRed : styles.sectionTitleCyan}>
                {isContamination ? (
                  <><Icon name="alert" size={16} /> Capas de Contaminación</>
                ) : (
                  <><Icon name="sparkles" size={16} /> Capas de Vida</>
                )}
              </h2>
              <div className={styles.layerList}>
                {layers.map((layer, i) => {
                  const isActive = activeLayers.includes(layer.id);
                  const itemClass = isActive
                    ? (isContamination ? styles.layerItemActiveRed : styles.layerItemActiveCyan)
                    : (isContamination ? styles.layerItemIdleRed : styles.layerItemIdleCyan);
                  const toggleClass = isActive
                    ? (isContamination ? styles.layerToggleOnRed : styles.layerToggleOnCyan)
                    : styles.layerToggle;
                  const knobClass = isActive ? styles.layerToggleKnobOn : styles.layerToggleKnob;

                  return (
                    <div
                      key={layer.id}
                      className={itemClass}
                      // Staggered so the toggles breathe in sequence instead of
                      // flashing in unison.
                      style={isActive ? undefined : { animationDelay: `${i * 320}ms` }}
                      onClick={() => handleToggle(layer.id)}
                    >
                      <span className={styles.layerIcon}><Icon name={layer.icon} size={20} /></span>
                      <div className={styles.layerInfo}>
                        <span className={styles.layerName}>{layer.label}</span>
                        <span className={styles.layerDesc}>{layer.description}</span>
                      </div>
                      <div className={toggleClass}>
                        <div className={knobClass} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Global Stats */}
            <div>
              <h2 className={isContamination ? styles.sectionTitleRed : styles.sectionTitleCyan}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="chart" size={16} /> Estadísticas Globales
                </div>
              </h2>
              <div className={styles.globalStats}>
                {stats.map((stat, i) => {
                  const isPositiveTrend = stat.trend.startsWith('+');
                  // For contamination, positive trend is bad (red). For life, positive is good (green).
                  const trendClass = isContamination
                    ? (isPositiveTrend ? styles.statTrendUp : styles.statTrendDown)
                    : (isPositiveTrend ? styles.statTrendDown : styles.statTrendUp);

                  return (
                    <div key={i} className={styles.statRow}>
                      <span className={styles.statLabel}>{stat.label}</span>
                      <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <span className={isContamination ? styles.statValueRed : styles.statValueCyan}>
                          <AnimatedCounter value={stat.value} duration={1200 + i * 200} />
                        </span>
                        <span className={styles.statUnit}>{stat.unit}</span>
                        {stat.trend && (
                          <span className={trendClass}>{stat.trend}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend — driven by the same stops the map paints with.
                Stops are spaced evenly by index rather than by value: the CO₂
                scale is logarithmic, so a linear gradient would squash every
                colour but the last into the leftmost pixels. */}
            <div className={styles.legend}>
              {scale && (
                <div>
                  <span className={styles.legendTitle}>{scale.unit}</span>
                  <div
                    className={styles.legendScale}
                    style={{
                      background: `linear-gradient(90deg, ${scale.stops
                        .map(([, color], i) => `${color} ${(i / (scale.stops.length - 1)) * 100}%`)
                        .join(', ')})`,
                    }}
                  />
                  <div className={styles.legendLabels}>
                    {scale.stops.map(([value], i) => (
                      <span key={i}>{value.toLocaleString('es-ES')}</span>
                    ))}
                  </div>
                  <div className={styles.legendNoData}>
                    <span className={styles.legendNoDataSwatch} style={{ background: NO_DATA_COLOR }} />
                    Sin datos en la fuente
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <p className={styles.footerText}>
                CO₂ y territorio protegido: Banco Mundial (API abierta)
                <br />
                PM2.5 en vivo: Open-Meteo · Ríos y áreas: UNEP
              </p>

              <div className={styles.creditDivider} />
              <div className={styles.credit}>
                <span className={styles.creditLabel}>Developing by</span>
                <span className={styles.creditName}>DevAngel</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
