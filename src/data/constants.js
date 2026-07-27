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

// ——— Choropleth colour scales ———
// Stops are [value, hex] pairs consumed by a MapLibre `interpolate` expression
// and reused verbatim by the sidebar legend, so map and legend cannot drift.
// Countries the source has no figure for. Deliberately a flat neutral grey and
// never a value on the scale: "not measured" must not read as "clean".
export const NO_DATA_COLOR = '#2a2a35';

export const CHOROPLETH = {
  co2: {
    property: 'co2',
    unit: 'Mt CO₂/año',
    // Emissions span five orders of magnitude (Tuvalu ~0 Mt, China 13.021 Mt)
    // and two thirds of countries sit under 50 Mt, so the stops climb roughly
    // logarithmically. Linear stops would flatten 117 of 172 countries into
    // the same colour.
    stops: [
      [1, '#ffd60a'],
      [25, '#ffa60a'],
      [100, '#ff7a2f'],
      [500, '#ff4d3d'],
      [2000, '#ff2d55'],
      [13500, '#7a0019'],
    ],
  },
  coverage: {
    property: 'coverage',
    unit: '% territorio protegido',
    // Roughly linear: the real range is 0 % to 59,7 %, median 16 %.
    stops: [
      [0, '#0a2540'],
      [10, '#0088ff'],
      [20, '#00d4ff'],
      [35, '#00ff87'],
      [60, '#7cffc4'],
    ],
  },
};

/** Flatten stops into the tail of a MapLibre `interpolate` expression. */
export function choroplethExpression({ property, stops }) {
  return ['interpolate', ['linear'], ['get', property], ...stops.flat()];
}

// ——— Fog (heatmap) ———
// Replaces the old glow circles. The radius is deliberately tight: a wide one
// makes neighbouring points bleed into each other and paints a continuous
// global field we have no data for. Short radii keep each reading as its own
// local haze, with honest blackness in between.
export const FOG = {
  air: {
    weight: 'pm25',
    // WHO calls 75 µg/m³ "very unhealthy"; anything above is already max fog.
    weightMax: 75,
    intensity: 1.3,
    // [zoom, radioMínimo, radioMáximo] — the cloud grows with the reading, the
    // way the old circles did, and the whole band scales with zoom.
    radius: [
      [1, 26, 78],
      [3, 45, 135],
      [5, 80, 240],
      [8, 160, 470],
    ],
    ramp: [
      [0.0, 'rgba(255, 214, 10, 0)'],
      [0.08, 'rgba(255, 214, 10, 0.30)'],
      [0.28, 'rgba(255, 159, 10, 0.52)'],
      [0.52, 'rgba(255, 107, 53, 0.68)'],
      [0.78, 'rgba(255, 45, 85, 0.80)'],
      [1.0, 'rgba(204, 0, 51, 0.90)'],
    ],
    legend: ['#ffd60a', '#ff9f0a', '#ff6b35', '#ff2d55', '#cc0033'],
    legendLabels: ['Aire limpio', 'Irrespirable'],
    unit: 'Densidad de PM2.5',
  },
  plastic: {
    weight: 'tons',
    weightMax: 60000,
    intensity: 1.2,
    radius: [
      [1, 30, 85],
      [3, 52, 145],
      [5, 92, 255],
      [8, 180, 500],
    ],
    ramp: [
      [0.0, 'rgba(186, 104, 255, 0)'],
      [0.1, 'rgba(186, 104, 255, 0.28)'],
      [0.4, 'rgba(218, 112, 214, 0.50)'],
      [0.7, 'rgba(236, 72, 200, 0.66)'],
      [1.0, 'rgba(255, 61, 180, 0.78)'],
    ],
    legend: ['#ba68ff', '#da70d6', '#ec48c8', '#ff3db4'],
    legendLabels: ['Disperso', 'Acumulado'],
    unit: 'Plástico en el océano',
  },
  protected: {
    // Colour comes from how alive the place is…
    weight: 'biodiversity_index',
    weightMax: 10,
    // …but the cloud is as big as the place itself. Areas run from a few
    // thousand km² to the Amazon's 5,5 million, so the builder precomputes a
    // square-rooted 0..1 `fogSize`; interpolating raw km² would leave every
    // reserve but the Amazon as a dot.
    radiusBy: 'fogSize',
    radiusMax: 1,
    intensity: 1.2,
    radius: [
      [1, 24, 80],
      [3, 42, 140],
      [5, 75, 250],
      [8, 150, 490],
    ],
    ramp: [
      [0.0, 'rgba(0, 120, 70, 0)'],
      [0.1, 'rgba(0, 150, 80, 0.30)'],
      [0.4, 'rgba(0, 200, 105, 0.50)'],
      [0.7, 'rgba(0, 255, 135, 0.66)'],
      [1.0, 'rgba(150, 255, 190, 0.80)'],
    ],
    legend: ['#009650', '#00c869', '#00ff87', '#96ffbe'],
    legendLabels: ['Menor', 'Mayor'],
    unit: 'Biodiversidad protegida',
  },
  lake: {
    // Lakes have no centerline to draw, so they get a water-coloured haze
    // instead. Both size and colour come from the basin: the Great Lakes
    // (244.106 km²) dwarf Baikal (31.500 km²).
    weight: 'fogSize',
    weightMax: 1,
    intensity: 1.1,
    radius: [
      [1, 22, 62],
      [3, 38, 108],
      [5, 68, 195],
      [8, 135, 380],
    ],
    ramp: [
      [0.0, 'rgba(0, 90, 180, 0)'],
      [0.1, 'rgba(0, 110, 220, 0.30)'],
      [0.4, 'rgba(0, 170, 245, 0.50)'],
      [0.7, 'rgba(0, 212, 255, 0.66)'],
      [1.0, 'rgba(160, 240, 255, 0.80)'],
    ],
    legend: ['#006edc', '#00aaf5', '#00d4ff', '#a0f0ff'],
    legendLabels: ['Menor', 'Mayor'],
    unit: 'Agua dulce superficial',
  },
};

/** Colour ramp keyed on `heatmap-density`. */
export function fogColor({ ramp }) {
  return ['interpolate', ['linear'], ['heatmap-density'], ...ramp.flat()];
}

/**
 * Cloud size, driven by both zoom and the measurement itself — a light reading
 * makes a small puff, a heavy one makes a wide cloud, exactly like the old
 * circles did. `heatmap-radius` is data-driven in MapLibre, so the zoom
 * interpolation wraps a per-feature interpolation at each stop.
 */
export function fogRadius({ radius, weight, weightMax, radiusBy, radiusMax }) {
  const prop = radiusBy ?? weight;
  const propMax = radiusMax ?? weightMax;
  return [
    'interpolate', ['linear'], ['zoom'],
    ...radius.flatMap(([zoom, min, max]) => [
      zoom,
      ['interpolate', ['linear'], ['get', prop], 0, min, propMax, max],
    ]),
  ];
}

/** Normalise the raw measurement into the 0..1 weight the heatmap expects. */
export function fogWeight({ weight, weightMax }) {
  return ['interpolate', ['linear'], ['get', weight], 0, 0, weightMax, 1];
}

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
    description: 'Puntos de medición PM2.5 por país y ciudad',
  },
  {
    id: CONTAMINATION_LAYERS.CO2_EMISSIONS,
    label: 'Emisiones de CO₂',
    icon: 'factory',
    description: 'Territorio coloreado por megatoneladas de CO₂ al año',
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
  PROTECTED_COVERAGE: 'protected-coverage',
};

export const LIFE_LAYER_CONFIG = [
  {
    id: LIFE_LAYERS.PROTECTED_COVERAGE,
    label: 'Territorio Protegido (%)',
    icon: 'map',
    description: 'Porcentaje de superficie terrestre protegida por país',
  },
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
