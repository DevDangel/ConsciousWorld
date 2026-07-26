import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MODES,
  CONTAMINATION_LAYER_CONFIG,
  LIFE_LAYER_CONFIG,
  GLOBAL_STATS,
} from '../../data/constants';
import AnimatedCounter from '../UI/AnimatedCounter';
import Icon from '../UI/Icons';
import styles from './Sidebar.module.css';

export default function Sidebar({ mode, activeLayers, onToggleLayer }) {
  const [isOpen, setIsOpen] = useState(true);
  const isContamination = mode === MODES.CONTAMINATION;
  const layers = isContamination ? CONTAMINATION_LAYER_CONFIG : LIFE_LAYER_CONFIG;
  const stats = isContamination ? GLOBAL_STATS.contamination : GLOBAL_STATS.life;

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
                {layers.map((layer) => {
                  const isActive = activeLayers.includes(layer.id);
                  const itemClass = isActive
                    ? (isContamination ? styles.layerItemActiveRed : styles.layerItemActiveCyan)
                    : styles.layerItem;
                  const toggleClass = isActive
                    ? (isContamination ? styles.layerToggleOnRed : styles.layerToggleOnCyan)
                    : styles.layerToggle;
                  const knobClass = isActive ? styles.layerToggleKnobOn : styles.layerToggleKnob;

                  return (
                    <div
                      key={layer.id}
                      className={itemClass}
                      onClick={() => onToggleLayer(layer.id)}
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
                  const trendNum = parseFloat(stat.trend);
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

            {/* Legend */}
            <div className={styles.legend}>
              <span className={styles.legendTitle}>
                {isContamination ? 'Intensidad de Contaminación' : 'Intensidad de Vida'}
              </span>
              <div className={isContamination ? styles.legendScaleRed : styles.legendScaleCyan} />
              <div className={styles.legendLabels}>
                <span>{isContamination ? 'Bajo' : 'Menor'}</span>
                <span>{isContamination ? 'Medio' : 'Media'}</span>
                <span>{isContamination ? 'Crítico' : 'Mayor'}</span>
              </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <p className={styles.footerText}>
                Datos: Our World in Data, WHO, UNEP
                <br />
                Última actualización: 2023
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
