/* ============================================
   ConsciousWorld — Constants & Configuration
   ============================================ */


// ——— Mode Configuration ———
export const MODES = {
  CONTAMINATION: 'contamination',
  LIFE: 'life',
};

// ——— Color Palettes ———
export const COLORS = {
  contamination: {
    primary: '#ff2d55',
    secondary: '#ff6b35',
    tertiary: '#ffd60a',
    glow: 'rgba(255, 45, 85, 0.25)',
    gradient: ['#ffd60a', '#ff6b35', '#ff2d55', '#cc0033'],
    heatmap: [
      [255, 214, 10, 60],    // yellow - low
      [255, 107, 53, 120],   // orange - medium
      [255, 45, 85, 180],    // red - high
      [204, 0, 51, 220],     // dark red - critical
    ],
  },
  life: {
    primary: '#00d4ff',
    secondary: '#00ff87',
    tertiary: '#0088ff',
    glow: 'rgba(0, 212, 255, 0.25)',
    gradient: ['#0088ff', '#00d4ff', '#00ff87'],
    heatmap: [
      [0, 136, 255, 60],     // blue - low
      [0, 212, 255, 120],    // cyan - medium
      [0, 255, 135, 180],    // green - high
    ],
  },
};

// ——— Contamination Layer IDs ———
export const CONTAMINATION_LAYERS = {
  AIR_QUALITY: 'air-quality',
  CO2_EMISSIONS: 'co2-emissions',
  OCEAN_PLASTIC: 'ocean-plastic',
};

export const CONTAMINATION_LAYER_CONFIG = [
  {
    id: CONTAMINATION_LAYERS.AIR_QUALITY,
    label: 'Calidad del Aire (PM2.5)',
    icon: 'wind',
    description: 'Concentración de partículas finas PM2.5 por país',
  },
  {
    id: CONTAMINATION_LAYERS.CO2_EMISSIONS,
    label: 'Emisiones de CO₂',
    icon: 'factory',
    description: 'Emisiones de dióxido de carbono por país (toneladas per cápita)',
  },
  {
    id: CONTAMINATION_LAYERS.OCEAN_PLASTIC,
    label: 'Plásticos en Océanos',
    icon: 'waves',
    description: 'Concentración de residuos plásticos en los océanos',
  },
];

// ——— Life Layer IDs ———
export const LIFE_LAYERS = {
  RIVERS: 'rivers',
  PROTECTED_AREAS: 'protected-areas',
};

export const LIFE_LAYER_CONFIG = [
  {
    id: LIFE_LAYERS.RIVERS,
    label: 'Ríos y Fuentes Hídricas',
    icon: 'droplets',
    description: 'Principales ríos y cuerpos de agua dulce del mundo',
  },
  {
    id: LIFE_LAYERS.PROTECTED_AREAS,
    label: 'Áreas Protegidas',
    icon: 'leaf',
    description: 'Parques nacionales y reservas naturales',
  },
];

// ——— Global Statistics ———
export const GLOBAL_STATS = {
  contamination: [
    { label: 'CO₂ Anual Global', value: '37.4', unit: 'Gt', trend: '+1.1%' },
    { label: 'Muertes por Polución', value: '8.1', unit: 'M/año', trend: '+3.2%' },
    { label: 'Plástico en Océanos', value: '14', unit: 'M ton/año', trend: '+5%' },
    { label: 'Bosque Perdido', value: '10', unit: 'M ha/año', trend: '-2.1%' },
  ],
  life: [
    { label: 'Áreas Protegidas', value: '16.6', unit: '% tierra', trend: '+0.5%' },
    { label: 'Agua Dulce Disponible', value: '0.5', unit: '% total', trend: '-0.3%' },
    { label: 'Especies Conocidas', value: '8.7', unit: 'M', trend: '+12K/año' },
    { label: 'Océanos Protegidos', value: '8.3', unit: '%', trend: '+1.2%' },
  ],
};

// ——— Country Names (Spanish) ———
export const COUNTRY_NAMES = {
  USA: 'Estados Unidos',
  CHN: 'China',
  IND: 'India',
  RUS: 'Rusia',
  JPN: 'Japón',
  DEU: 'Alemania',
  GBR: 'Reino Unido',
  FRA: 'Francia',
  BRA: 'Brasil',
  CAN: 'Canadá',
  KOR: 'Corea del Sur',
  AUS: 'Australia',
  MEX: 'México',
  IDN: 'Indonesia',
  SAU: 'Arabia Saudita',
  ZAF: 'Sudáfrica',
  TUR: 'Turquía',
  IRN: 'Irán',
  THA: 'Tailandia',
  EGY: 'Egipto',
  COL: 'Colombia',
  ARG: 'Argentina',
  NGA: 'Nigeria',
  POL: 'Polonia',
  MYS: 'Malasia',
};
