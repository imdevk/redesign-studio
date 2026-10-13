import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hexToRgb, inkFor, toHex } from './colors.js';
import { UserError } from './errors.js';

// Colours and fonts of a finished design live in CSS variables on :root. Changing them is plain CSS,
// so it is instant and free: the AI is not called again. The saved design.html is never modified;
// the chosen overrides are stored beside it and added when the page is served, downloaded or exported.

export const COLOR_ROLES = [
  { id: 'brand', label: 'Accent', uses: 'Buttons, links and highlights' },
  { id: 'bg', label: 'Background', uses: 'The page background' },
  { id: 'surface', label: 'Cards and bands', uses: 'Cards and alternate sections' },
  { id: 'text', label: 'Text', uses: 'Headings and body text' },
  { id: 'muted', label: 'Soft text', uses: 'Captions and small print' }
];
export const FONT_ROLES = [
  { id: 'heading', label: 'Headings', uses: 'Titles and section headings' },
  { id: 'body', label: 'Body text', uses: 'Paragraphs, menus and buttons' }
];

const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const SERIF = 'Georgia,"Times New Roman",serif';
export const FONTS = [
  { id: 'system-sans', label: 'System sans', kind: 'sans', stack: SANS },
  { id: 'system-serif', label: 'Georgia', kind: 'serif', stack: SERIF },
  { id: 'system-mono', label: 'System mono', kind: 'mono', stack: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' },
  { id: 'inter', label: 'Inter', kind: 'sans', pkg: 'inter' },
  { id: 'dm-sans', label: 'DM Sans', kind: 'sans', pkg: 'dm-sans' },
  { id: 'poppins', label: 'Poppins', kind: 'sans', pkg: 'poppins' },
  { id: 'montserrat', label: 'Montserrat', kind: 'sans', pkg: 'montserrat' },
  { id: 'nunito', label: 'Nunito', kind: 'sans', pkg: 'nunito' },
  { id: 'work-sans', label: 'Work Sans', kind: 'sans', pkg: 'work-sans' },
  { id: 'space-grotesk', label: 'Space Grotesk', kind: 'sans', pkg: 'space-grotesk' },
  { id: 'playfair-display', label: 'Playfair Display', kind: 'serif', pkg: 'playfair-display' },
  { id: 'lora', label: 'Lora', kind: 'serif', pkg: 'lora' },
  { id: 'merriweather', label: 'Merriweather', kind: 'serif', pkg: 'merriweather' }
];
const fontById = new Map(FONTS.map(f => [f.id, f]));
const familyOf = font => `RS ${font.label}`;
const stackOf = font => (font.pkg ? `"${familyOf(font)}",${font.kind === 'serif' ? SERIF : SANS}` : font.stack);

// Ready-made palettes. Each sets all five colours.
export const PALETTES = [
  { id: 'indigo', label: 'Indigo', brand: '#4f46e5', bg: '#ffffff', surface: '#f3f4fb', text: '#14162b', muted: '#5b607a' },
  { id: 'forest', label: 'Forest', brand: '#2f7d4f', bg: '#fbfaf6', surface: '#eef3ea', text: '#17261c', muted: '#5a6b5f' },
  { id: 'ocean', label: 'Ocean', brand: '#0e7490', bg: '#ffffff', surface: '#ecf5f8', text: '#0f2530', muted: '#566b75' },
  { id: 'sunset', label: 'Sunset', brand: '#c2410c', bg: '#fffaf5', surface: '#fdeedd', text: '#2b1a10', muted: '#7a6455' },
  { id: 'rose', label: 'Rose', brand: '#be185d', bg: '#fffafc', surface: '#fceef4', text: '#2a1220', muted: '#7a5a6a' },
  { id: 'graphite', label: 'Graphite', brand: '#111827', bg: '#ffffff', surface: '#f3f4f6', text: '#111827', muted: '#6b7280' },
  { id: 'midnight', label: 'Midnight', brand: '#818cf8', bg: '#0e1020', surface: '#171a31', text: '#eef0ff', muted: '#a3a8c9' },
  { id: 'ember', label: 'Ember', brand: '#f59e0b', bg: '#16130f', surface: '#211c15', text: '#fbf3e6', muted: '#bfae94' }
];

const COLOR_VARS = Object.fromEntries(COLOR_ROLES.map(r => [r.id, `--${r.id}`]));
const FONT_VARS = { heading: '--font-heading', body: '--font-body' };

// ---------- reading what a design uses ----------

function styleText(html) {
  return [...html.matchAll(/<style\b(?![^>]*\bid=["']rs-(?:theme|fonts)["'])[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
}
const rootRules = css => [...css.matchAll(/(?:^|[}\s,])(?:html)?:root\s*\{([^}]*)\}/gi)].map(m => m[1]);

/** Last :root declaration of each custom property in the design's own CSS (the placeholder style comes first and loses). */
function declared(html) {
  const vars = {};
  for (const css of styleText(html)) {
    for (const body of rootRules(css)) {
      for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) vars[m[1].toLowerCase()] = m[2].trim();
    }
  }
  return vars;
}

/** Hex, rgb() and hsl() values to #rrggbb; anything else (var(), color-mix(), names) is not editable. */
export function parseColor(value) {
  const v = String(value || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${[...m[1]].map(c => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(v);
  if (m) return toHex([m[1], m[2], m[3]].map(Number));
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(v);
  if (m) {
    const h = Number(m[1]) % 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  return null;
}

function fontFromValue(value) {
  const first = String(value || '').split(',')[0].replace(/["']/g, '').trim();
  const name = first.toLowerCase();
  const alias = ['system-ui', '-apple-system', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue', 'arial', 'sans-serif'].includes(name) ? 'system-sans'
    : ['times new roman', 'times', 'serif'].includes(name) ? 'system-serif'
    : ['ui-monospace', 'menlo', 'consolas', 'monospace'].includes(name) ? 'system-mono' : null;
  const match = fontById.get(alias) || FONTS.find(f => f.label.toLowerCase() === name || familyOf(f).toLowerCase() === name);
  return { label: match?.label || first || 'Default', id: match?.id || null, stack: String(value || '').trim() };
}

/** Count colours written directly into the design instead of through variables (neutral greys excluded). */
function fixedColours(html) {
  let css = styleText(html).map(c => c.replace(/(?:html)?:root\s*\{[^}]*\}/gi, '')).join('\n');
  css += '\n' + [...html.matchAll(/\bstyle="([^"]*)"/gi)].map(m => m[1]).join('\n');
  let count = 0;
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi)) {
    const hex = parseColor(m[0].replace(/\s*[,/]\s*[\d.]+%?\s*\)$/, ')').replace(/^rgba/, 'rgb').replace(/^hsla/, 'hsl'));
    const rgb = hex && hexToRgb(hex);
    if (rgb && rgb[0] === rgb[1] && rgb[1] === rgb[2]) continue;
    count += 1;
  }
  return count;
}

/** What can be changed in this design, with the values it came with. */
export function readTheme(html) {
  const vars = declared(String(html));
  const colors = COLOR_ROLES.map(role => {
    const value = parseColor(vars[COLOR_VARS[role.id]]);
    return value ? { ...role, value } : null;
  }).filter(Boolean);
  const fonts = FONT_ROLES.map(role => (vars[FONT_VARS[role.id]] ? { ...role, current: fontFromValue(vars[FONT_VARS[role.id]]) } : null)).filter(Boolean);
  return { colors, fonts, fixedColours: fixedColours(String(html)), adjustable: colors.length > 0 || fonts.length > 0 };
}

// ---------- applying choices ----------

/** Checks what the browser sent. Returns only known roles with valid values. */
export function validateTheme(body) {
  const out = { colors: {}, fonts: {} };
  const colors = body?.colors && typeof body.colors === 'object' ? body.colors : {};
  const fonts = body?.fonts && typeof body.fonts === 'object' ? body.fonts : {};
  for (const [key, value] of Object.entries(colors)) {
    if (!COLOR_VARS[key]) throw new UserError(`Unknown colour "${String(key).slice(0, 20)}".`, 400);
    if (value === null || value === '') continue;
    const hex = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
    if (!hex) throw new UserError('Colours must be hex codes such as #0f766e.', 400);
    out.colors[key] = hex;
  }
  for (const [key, value] of Object.entries(fonts)) {
    if (!FONT_VARS[key]) throw new UserError(`Unknown font role "${String(key).slice(0, 20)}".`, 400);
    if (value === null || value === '') continue;
    if (typeof value !== 'string' || !fontById.has(value)) throw new UserError('That font is not available.', 400);
    out.fonts[key] = value;
  }
  return out;
}

const fileCache = new Map();
async function fontBase64(font, weight) {
  const key = `${font.id}-${weight}`;
  if (!fileCache.has(key)) {
    const dir = path.dirname(createRequire(import.meta.url).resolve(`@fontsource/${font.pkg}/package.json`));
    fileCache.set(key, (await readFile(path.join(dir, 'files', `${font.pkg}-latin-${weight}-normal.woff2`))).toString('base64'));
  }
  return fileCache.get(key);
}
async function fontFace(font, weight) {
  return `@font-face{font-family:"${familyOf(font)}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${await fontBase64(font, weight)}) format("woff2")}`;
}

/** Raw bytes of one bundled font file, used by the tool's own font picker. */
export async function fontFile(id, weight) {
  const font = fontById.get(id);
  if (!font?.pkg || ![400, 700].includes(weight)) return null;
  return Buffer.from(await fontBase64(font, weight), 'base64');
}

const isDark = hex => { const [r, g, b] = hexToRgb(hex) || [255, 255, 255]; return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45; };

/** Adds the chosen colours and fonts to a design. With nothing chosen the design comes back unchanged. */
export async function applyTheme(html, theme) {
  const source = String(html).replace(/<style id="rs-(?:theme|fonts)">[\s\S]*?<\/style>/g, '');
  const colors = theme?.colors || {}, fonts = theme?.fonts || {};
  if (!Object.keys(colors).length && !Object.keys(fonts).length) return source;

  const rules = [];
  for (const [role, value] of Object.entries(colors)) {
    if (!COLOR_VARS[role]) continue;
    rules.push(`${COLOR_VARS[role]}:${value}!important`);
    if (role === 'brand') rules.push(`--brand-ink:${inkFor(value)}!important`);
  }
  const faces = [];
  const wanted = new Set();
  for (const [role, id] of Object.entries(fonts)) {
    const font = fontById.get(id);
    if (!font || !FONT_VARS[role]) continue;
    rules.push(`${FONT_VARS[role]}:${stackOf(font)}!important`);
    if (font.pkg) wanted.add(font.id);
  }
  for (const id of wanted) { const font = fontById.get(id); faces.push(await fontFace(font, 400), await fontFace(font, 700)); }

  // Picture placeholders follow a dark background so they do not glow.
  const dark = colors.bg ? isDark(colors.bg) : false;
  const extra = dark ? '.ph{--ph-a:color-mix(in srgb,var(--brand) 42%,#0b0d14);--ph-b:color-mix(in srgb,var(--brand) 24%,#0b0d14);--ph-line:rgba(255,255,255,.06);--ph-icon:color-mix(in srgb,var(--brand) 40%,#fff);--ph-text:#fff;--ph-tag:rgba(0,0,0,.38)}' : '';
  const block = `${faces.length ? `<style id="rs-fonts">${faces.join('')}</style>` : ''}<style id="rs-theme">html:root{${rules.join(';')}}${extra}</style>`;
  return /<\/head>/i.test(source) ? source.replace(/<\/head>/i, () => `${block}</head>`) : `${block}${source}`;
}
