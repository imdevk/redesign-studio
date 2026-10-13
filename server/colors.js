// Turns colour samples taken from the live page into a small palette the designer can use.

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const isNeutral = rgb => { const { s, l } = toHsl(rgb); return s < 0.14 || l < 0.08 || l > 0.95; };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function topBy(weights, limit, { minGap = 0 } = {}) {
  const picked = [];
  for (const [hex, weight] of [...weights.entries()].sort((a, b) => b[1] - a[1])) {
    const rgb = hexToRgb(hex);
    if (picked.some(p => distance(p.rgb, rgb) < minGap)) continue;
    picked.push({ hex, rgb, weight });
    if (picked.length >= limit) break;
  }
  return picked;
}

/**
 * samples: [{ rgba: [r, g, b, a], weight, kind }] where kind is
 * 'bg' (a surface), 'text', or 'accent' (button, link or highlight colour).
 */
export function summarizeColors(samples) {
  const bg = new Map(), text = new Map(), accent = new Map();
  const add = (map, rgb, weight) => { const key = toHex(rgb); map.set(key, (map.get(key) || 0) + weight); };
  for (const { rgba, weight, kind } of samples) {
    const [r, g, b, a] = rgba;
    if (a < 0.5 || !(weight > 0)) continue;
    const rgb = [r, g, b];
    if (kind === 'bg') {
      add(bg, rgb, weight);
      // A big surface only counts as a brand colour when it is clearly coloured and not near-black or near-white.
      const { s, l } = toHsl(rgb);
      if (s > 0.25 && l > 0.15 && l < 0.9) add(accent, rgb, weight * 0.35);
    } else if (kind === 'text') {
      add(text, rgb, weight);
    } else if (kind === 'accent' && !isNeutral(rgb)) {
      add(accent, rgb, weight * 3);
    }
  }
  const background = topBy(bg, 1)[0]?.hex || '#ffffff';
  const body = topBy(text, 1)[0]?.hex || '#111111';
  // An accent that is really just the text or page colour is not a brand colour.
  const notBase = c => distance(c.rgb, hexToRgb(body)) > 45 && distance(c.rgb, hexToRgb(background)) > 45;
  const accents = topBy(accent, 8, { minGap: 60 }).filter(notBase).slice(0, 4).map(c => c.hex);
  return {
    background,
    text: body,
    accents,
    surfaces: topBy(bg, 4, { minGap: 30 }).map(c => c.hex)
  };
}

/** A readable text colour (near-black or white) for something painted in the given colour. */
export function inkFor(hex) {
  const rgb = hexToRgb(hex) || [79, 70, 229];
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}
