import { AIR_FLOW } from '../../data/constants';
import { bilinear } from '../../utils/airField';

const MAX_LAT = 85.0511287798066; // Web Mercator limit, what an image source spans.

// Precomputed lookup: PM2.5 (0..127 µg/m³, 1 µg steps) → RGBA, from the
// AIR_FLOW.overlay stops. Sampling a table beats interpolating stops per pixel.
const LUT = (() => {
  const stops = AIR_FLOW.overlay;
  const lut = new Uint8ClampedArray(128 * 4);
  for (let v = 0; v < 128; v++) {
    let rgba;
    if (v <= stops[0][0]) rgba = stops[0][1];
    else if (v >= stops[stops.length - 1][0]) rgba = stops[stops.length - 1][1];
    else {
      const s = stops.findIndex(([x]) => x > v);
      const [x0, c0] = stops[s - 1];
      const [x1, c1] = stops[s];
      const t = (v - x0) / (x1 - x0);
      rgba = c0.map((c, i) => c + (c1[i] - c) * t);
    }
    lut[v * 4] = rgba[0];
    lut[v * 4 + 1] = rgba[1];
    lut[v * 4 + 2] = rgba[2];
    lut[v * 4 + 3] = rgba[3] * 255;
  }
  return lut;
})();

/**
 * Paint the PM2.5 field as a Web Mercator image for a MapLibre `image`
 * source. Rows are laid out in Mercator (not plain lat/lng) because that is
 * the space MapLibre stretches image sources in; an equirectangular image
 * would drift north the further you got from the equator.
 */
export function renderPollutionOverlay(field, values, size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const px = img.data;

  for (let y = 0; y < size; y++) {
    const merc = Math.PI * (1 - (2 * (y + 0.5)) / size);
    const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
    for (let x = 0; x < size; x++) {
      const lng = -180 + (360 * (x + 0.5)) / size;
      const v = Math.min(127, Math.max(0, Math.round(bilinear(field, values, lng, lat))));
      const o = (y * size + x) * 4;
      px[o] = LUT[v * 4];
      px[o + 1] = LUT[v * 4 + 1];
      px[o + 2] = LUT[v * 4 + 2];
      px[o + 3] = LUT[v * 4 + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export const OVERLAY_COORDINATES = [
  [-180, MAX_LAT],
  [180, MAX_LAT],
  [180, -MAX_LAT],
  [-180, -MAX_LAT],
];
