/**
 * Format large numbers with abbreviations
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString('es-ES');
}

/**
 * Format CO2 values
 * @param {number} mt - Megatons
 * @returns {string}
 */
export function formatCO2(mt) {
  if (mt >= 1000) return (mt / 1000).toFixed(1) + ' Gt';
  return mt.toLocaleString('es-ES') + ' Mt';
}

/**
 * Get severity color based on PM2.5 levels
 * @param {number} pm25
 * @returns {string}
 */
export function getAirQualityColor(pm25) {
  if (pm25 >= 55) return '#ff2d55';
  if (pm25 >= 35) return '#ff6b35';
  if (pm25 >= 20) return '#ffd60a';
  if (pm25 >= 12) return '#ffaa00';
  return '#00ff87';
}

/**
 * Get severity label for PM2.5
 * @param {string} level
 * @returns {{ label: string, color: string }}
 */
export function getAirQualityLabel(level) {
  const map = {
    critical: { label: 'Crítico', color: '#ff2d55' },
    high: { label: 'Alto', color: '#ff6b35' },
    moderate: { label: 'Moderado', color: '#ffd60a' },
    low: { label: 'Bajo', color: '#00ff87' },
  };
  return map[level] || map.low;
}

/**
 * Get conservation status styling
 * @param {string} status
 * @returns {{ label: string, color: string }}
 */
export function getConservationStatus(status) {
  const map = {
    'Protegido': { label: 'Protegido', color: '#00ff87' },
    'Amenazada': { label: 'Amenazada', color: '#ff6b35' },
    'Crítico': { label: 'Crítico', color: '#ff2d55' },
  };
  return map[status] || { label: status, color: '#8888a0' };
}

/**
 * Interpolate between two colors
 * @param {string} color1 - hex color
 * @param {string} color2 - hex color
 * @param {number} factor - 0 to 1
 * @returns {string}
 */
export function interpolateColor(color1, color2, factor) {
  const hex = (c) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3));
  const g1 = hex(color1.slice(3, 5));
  const b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3));
  const g2 = hex(color2.slice(3, 5));
  const b2 = hex(color2.slice(5, 7));

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Format area in km²
 * @param {number} km2
 * @returns {string}
 */
export function formatArea(km2) {
  if (km2 >= 1e6) return (km2 / 1e6).toFixed(1) + 'M km²';
  if (km2 >= 1e3) return (km2 / 1e3).toFixed(0) + 'K km²';
  return km2.toLocaleString('es-ES') + ' km²';
}
