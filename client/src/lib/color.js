/**
 * Pulls a representative colour out of an image so the header can take on the
 * tone of whatever wallpaper is showing.
 */

const SAMPLE_SIZE = 16;

/**
 * Average an image down to a single colour by drawing it very small and
 * letting the browser do the downsampling.
 *
 * Returns null when the pixels cannot be read — a cross-origin image taints the
 * canvas, and the caller should simply fall back to the default styling.
 */
export function averageColor(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    let r = 0;
    let g = 0;
    let b = 0;
    let counted = 0;

    for (let i = 0; i < data.length; i += 4) {
      // Skip near-transparent pixels; they would wash the average toward black.
      if (data[i + 3] < 125) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      counted += 1;
    }

    if (counted === 0) return null;

    return {
      r: Math.round(r / counted),
      g: Math.round(g / counted),
      b: Math.round(b / counted),
    };
  } catch {
    // Tainted canvas, or no canvas support.
    return null;
  }
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Whether white text reads better than dark text on this colour. */
export function prefersLightText(color) {
  return relativeLuminance(color) < 0.5;
}

export const toRgb = ({ r, g, b }) => `rgb(${r} ${g} ${b})`;

/**
 * Nudge a colour toward black or white. Averaged photos land in the mid greys,
 * which makes for a muddy header; deepening a dark tone and lightening a pale
 * one keeps the bar looking deliberate.
 */
export function shade(color, amount) {
  const mix = (value, target) => Math.round(value + (target - value) * amount);
  const target = prefersLightText(color) ? 0 : 255;

  return { r: mix(color.r, target), g: mix(color.g, target), b: mix(color.b, target) };
}

/** The full tone descriptor the header needs. */
export function toneFrom(color) {
  if (!color) return null;

  const base = shade(color, 0.25);
  return {
    background: toRgb(base),
    isDark: prefersLightText(base),
  };
}
