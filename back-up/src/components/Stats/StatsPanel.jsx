import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatArea, getAirQualityLabel, getConservationStatus } from '../../utils/formatters';
import AnimatedCounter from '../UI/AnimatedCounter';
import Icon from '../UI/Icons';
import styles from './StatsPanel.module.css';

// Dispatch on an explicit discriminator rather than on the display label, so
// renaming a heading in the UI can never silently change which panel renders.
const RENDERERS = {
  co2: renderCO2Detail,
  air: renderAirQualityDetail,
  city: renderCityDetail,
  plastic: renderOceanPlasticDetail,
  river: renderRiverDetail,
  protectedArea: renderProtectedAreaDetail,
  coverage: renderCoverageDetail,
};

export default function StatsPanel({ selectedItem, onClose }) {
  if (!selectedItem?.data) return null;

  const item = selectedItem.data;
  const render = RENDERERS[selectedItem.kind];

  return (
    <motion.div
      className={styles.statsPanel}
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.headerIcon}><Icon name={selectedItem.icon} size={24} /></span>
          <div className={styles.headerText}>
            <h2 className={styles.headerTitle}>{selectedItem.name || item.name}</h2>
            <span className={styles.headerSubtitle}>{selectedItem.type}</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar panel">✕</button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {render ? render(item, styles) : null}
      </div>
    </motion.div>
  );
}

function renderCO2Detail(item, s) {
  const trendData = item.years?.map((y, i) => ({ year: y, value: item.trend[i] })) || [];
  const sectorEntries = item.sector ? Object.entries(item.sector) : [];
  const sectorNames = {
    energy: 'Energía',
    industry: 'Industria',
    transport: 'Transporte',
    buildings: 'Edificios',
    other: 'Otros',
  };

  return (
    <>
      {/* Main highlight */}
      <div className={s.highlightRed}>
        <div>
          <div className={s.highlightValueRed}>
            <AnimatedCounter value={item.co2_total_mt} />
          </div>
          <div className={s.highlightLabel}>Megatoneladas CO₂/año</div>
        </div>
        <div>
          <div className={s.highlightValueRed} style={{ fontSize: 24 }}>
            <AnimatedCounter value={item.co2_per_capita} suffix="" />
          </div>
          <div className={s.highlightLabel}>Ton per cápita</div>
        </div>
      </div>

      {/* Trend chart */}
      {trendData.length > 0 && (
        <div className={s.chartSection}>
          <h3 className={s.chartTitle}><Icon name="trending" size={16} style={{ marginRight: '8px' }} /> Tendencia (10 años)</h3>
          <div className={s.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="co2Gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff2d55" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ff2d55" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#8888a0', fontSize: 10 }}
                  axisLine={{ stroke: '#ffffff08' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8888a0', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    color: '#e8e8ed',
                    fontSize: 12,
                  }}
                  formatter={(val) => [`${val} Mt`, 'CO₂']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#ff2d55"
                  strokeWidth={2}
                  fill="url(#co2Gradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#ff2d55' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sector breakdown */}
      {sectorEntries.length > 0 && (
        <div className={s.chartSection}>
          <h3 className={s.chartTitle}><Icon name="factory" size={16} style={{ marginRight: '8px' }} /> Emisiones por sector</h3>
          <div className={s.sectorBars}>
            {sectorEntries
              .sort((a, b) => b[1] - a[1])
              .map(([key, val]) => (
                <div key={key} className={s.sectorRow}>
                  <div className={s.sectorHeader}>
                    <span className={s.sectorName}>{sectorNames[key] || key}</span>
                    <span className={s.sectorPercent}>{val}%</span>
                  </div>
                  <div className={s.sectorBar}>
                    <div
                      className={s.sectorFill}
                      style={{
                        width: `${val}%`,
                        background: `linear-gradient(90deg, #ff2d55, #ff6b35)`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

function renderAirQualityDetail(item, s) {
  const status = getAirQualityLabel(item.level);

  return (
    <>
      <div className={s.highlightRed}>
        <div>
          <div className={s.highlightValueRed}>
            <AnimatedCounter value={item.pm25} />
          </div>
          <div className={s.highlightLabel}>PM2.5 (μg/m³)</div>
        </div>
        <div>
          <span
            className={s.statusBadge}
            style={{ background: `${status.color}20`, color: status.color }}
          >
            ● {status.label}
          </span>
        </div>
      </div>

      {/* Cities list */}
      {item.cities && item.cities.length > 0 && (
        <div className={s.chartSection}>
          <h3 className={s.chartTitle}><Icon name="city" size={16} style={{ marginRight: '8px' }} /> Ciudades principales</h3>
          <div className={s.citiesList}>
            {[...item.cities]
              .sort((a, b) => b.pm25 - a.pm25)
              .map((city, i) => {
                const cityStatus = getAirQualityLabel(
                  city.pm25 >= 55 ? 'critical' : city.pm25 >= 35 ? 'high' : city.pm25 >= 20 ? 'moderate' : 'low'
                );
                return (
                  <div key={i} className={s.cityRow}>
                    <span className={s.cityName}>{city.name}</span>
                    <span className={s.cityValue} style={{ color: cityStatus.color }}>
                      {city.pm25} μg/m³
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className={s.descriptionRed}>
        La OMS recomienda un máximo de <strong>5 μg/m³</strong> de PM2.5 anual.
        Valores superiores a 35 μg/m³ representan riesgo significativo para la salud.
      </div>
    </>
  );
}

function renderOceanPlasticDetail(item, s) {
  return (
    <>
      <div className={s.highlightRed}>
        <div>
          <div className={s.highlightValueRed}>
            <AnimatedCounter value={item.tons} />
          </div>
          <div className={s.highlightLabel}>Toneladas de plástico</div>
        </div>
      </div>

      <div className={s.infoSection}>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>Área afectada</span>
          <span className={s.infoValue}>{formatArea(item.area_km2)}</span>
        </div>
      </div>

      <div className={s.descriptionRed}>
        {item.description}
      </div>
    </>
  );
}

function renderRiverDetail(item, s) {
  return (
    <>
      <div className={s.highlightCyan}>
        <div>
          <div className={s.highlightValueCyan}>
            <AnimatedCounter value={item.length_km} />
          </div>
          <div className={s.highlightLabel}>Kilómetros de longitud</div>
        </div>
      </div>

      <div className={s.infoSection}>
        {item.discharge_m3s > 0 && (
          <div className={s.infoRow}>
            <span className={s.infoLabel}>Caudal</span>
            <span className={s.infoValue}>{item.discharge_m3s.toLocaleString('es-ES')} m³/s</span>
          </div>
        )}
        <div className={s.infoRow}>
          <span className={s.infoLabel}>Cuenca</span>
          <span className={s.infoValue}>{formatArea(item.basin_km2)}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>Países</span>
          <span className={s.infoValue}>{item.countries?.join(', ')}</span>
        </div>
      </div>

      <div className={s.descriptionCyan}>
        {item.description}
      </div>
    </>
  );
}

function renderProtectedAreaDetail(item, s) {
  const conservation = getConservationStatus(item.status);

  return (
    <>
      <div className={s.highlightCyan}>
        <div>
          <div className={s.highlightValueCyan}>
            <AnimatedCounter value={item.biodiversity_index} />
          </div>
          <div className={s.highlightLabel}>Índice de biodiversidad</div>
        </div>
        <div>
          <div className={s.highlightValueCyan} style={{ fontSize: 24 }}>
            <AnimatedCounter value={item.species_count} />
          </div>
          <div className={s.highlightLabel}>Especies</div>
        </div>
      </div>

      <div className={s.infoSection}>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>Tipo</span>
          <span className={s.infoValue}>{item.type}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>Área</span>
          <span className={s.infoValue}>{formatArea(item.area_km2)}</span>
        </div>
        <div className={s.infoRow}>
          <span className={s.infoLabel}>Estado</span>
          <span
            className={s.statusBadge}
            style={{ background: `${conservation.color}20`, color: conservation.color }}
          >
            ● {conservation.label}
          </span>
        </div>
      </div>

      <div className={s.descriptionCyan}>
        {item.description}
      </div>
    </>
  );
}

// Global target from the Kunming-Montreal Global Biodiversity Framework
// (Target 3): 30% of land and sea protected by 2030.
const GBF_TARGET_PCT = 30;

function renderCoverageDetail(item, s) {
  const pct = item.protected_pct;
  const share = Math.min(pct / GBF_TARGET_PCT, 1) * 100;
  const meetsTarget = pct >= GBF_TARGET_PCT;

  return (
    <>
      <div className={s.highlightCyan}>
        <div>
          <div className={s.highlightValueCyan}>
            <AnimatedCounter value={pct} suffix="%" />
          </div>
          <div className={s.highlightLabel}>Superficie terrestre protegida</div>
        </div>
        <div>
          <span
            className={s.statusBadge}
            style={{
              background: meetsTarget ? '#00ff8720' : '#ff6b3520',
              color: meetsTarget ? '#00ff87' : '#ff6b35',
            }}
          >
            ● {meetsTarget ? 'Meta cumplida' : 'Bajo la meta'}
          </span>
        </div>
      </div>

      <div className={s.chartSection}>
        <h3 className={s.chartTitle}>
          <Icon name="leaf" size={16} style={{ marginRight: '8px' }} /> Avance hacia la meta 30x30
        </h3>
        <div className={s.sectorRow}>
          <div className={s.sectorHeader}>
            <span className={s.sectorName}>{pct}% de {GBF_TARGET_PCT}%</span>
            <span className={s.sectorPercent}>{share.toFixed(0)}%</span>
          </div>
          <div className={s.sectorBar}>
            <div
              className={s.sectorFill}
              style={{
                width: `${share}%`,
                background: meetsTarget
                  ? 'linear-gradient(90deg, #00d4ff, #00ff87)'
                  : 'linear-gradient(90deg, #0088ff, #00d4ff)',
              }}
            />
          </div>
        </div>
      </div>

      <div className={s.descriptionCyan}>
        El Marco Global de Biodiversidad de Kunming-Montreal fija en <strong>30%</strong> la
        superficie terrestre y marina protegida para 2030.
        <br /><br />
        <em>Valor aproximado (Banco Mundial / Protected Planet, ~2018-2022). Contrastar con
        la fuente oficial antes de citarlo.</em>
      </div>
    </>
  );
}

function renderCityDetail(item, s) {
  const status = getAirQualityLabel(
    item.pm25 >= 55 ? 'critical' : item.pm25 >= 35 ? 'high' : item.pm25 >= 20 ? 'moderate' : 'low'
  );

  return (
    <>
      <div className={s.highlightRed}>
        <div>
          <div className={s.highlightValueRed}>
            <AnimatedCounter value={item.pm25} />
          </div>
          <div className={s.highlightLabel}>PM2.5 (μg/m³)</div>
        </div>
        <div>
          <span
            className={s.statusBadge}
            style={{ background: `${status.color}20`, color: status.color }}
          >
            ● {status.label}
          </span>
        </div>
      </div>
    </>
  );
}
