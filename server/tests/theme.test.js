import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, parseColor, readTheme, validateTheme, fontFile } from '../theme.js';

const design = `<!DOCTYPE html><html><head><style id="rs-placeholders">:root{--brand:#111111}</style>
<style>:root{--brand:#c2410c;--brand-ink:#fff;--bg:rgb(251,246,238);--surface:#fff3e6;--text:#2b2118;--muted:hsl(30,20%,40%);--font-heading:"Playfair Display",Georgia,serif;--font-body:system-ui,sans-serif}
body{background:var(--bg);color:var(--text);font-family:var(--font-body)}h1{font-family:var(--font-heading)}.x{color:#d33a00;box-shadow:0 1px 3px rgba(0,0,0,.2)}</style></head><body><h1>Hi</h1><p>Text</p></body></html>`;

test('reads the colours and fonts a design uses, from its own :root rule', () => {
  const t = readTheme(design);
  assert.deepEqual(t.colors.map(c => [c.id, c.value]), [['brand', '#c2410c'], ['bg', '#fbf6ee'], ['surface', '#fff3e6'], ['text', '#2b2118'], ['muted', '#7a6652']]);
  assert.deepEqual(t.fonts.map(f => [f.id, f.current.id, f.current.label]), [['heading', 'playfair-display', 'Playfair Display'], ['body', 'system-sans', 'System sans']]);
  assert.equal(t.fixedColours, 1); // #d33a00 only: greys and black shadows are ignored
  assert.equal(t.adjustable, true);
});

test('a design without theme variables is reported as not adjustable', () => {
  const t = readTheme('<html><head><style>body{color:red}</style></head><body>x</body></html>');
  assert.equal(t.adjustable, false);
});

test('colours in other notations are understood', () => {
  assert.equal(parseColor('#abc'), '#aabbcc');
  assert.equal(parseColor('rgb(0, 128, 255)'), '#0080ff');
  assert.equal(parseColor('var(--x)'), null);
  assert.equal(parseColor('color-mix(in srgb, red, blue)'), null);
});

test('choices are validated', () => {
  assert.deepEqual(validateTheme({ colors: { brand: '#0E7490' }, fonts: { heading: 'lora' } }), { colors: { brand: '#0e7490' }, fonts: { heading: 'lora' } });
  assert.throws(() => validateTheme({ colors: { brand: 'red' } }), /hex/);
  assert.throws(() => validateTheme({ colors: { evil: '#000000' } }), /Unknown/);
  assert.throws(() => validateTheme({ fonts: { body: 'comic-sans' } }), /not available/);
  assert.throws(() => validateTheme({ colors: { brand: '#000000;}</style><script>' } }), /hex/);
});

test('applying a theme only adds a style block and embeds only the fonts chosen', async () => {
  assert.equal(await applyTheme(design, { colors: {}, fonts: {} }), design);
  const out = await applyTheme(design, { colors: { brand: '#0e7490', bg: '#0e1020' }, fonts: { heading: 'lora' } });
  assert.match(out, /html:root\{--brand:#0e7490!important;--brand-ink:#ffffff!important;--bg:#0e1020!important;--font-heading:"RS Lora"/);
  assert.match(out, /@font-face\{font-family:"RS Lora"/);
  assert.doesNotMatch(out, /RS Inter/);
  assert.ok(out.includes(design.slice(0, 200)));
  // applying again replaces, never stacks
  const again = await applyTheme(out, { colors: { brand: '#be185d' }, fonts: {} });
  assert.equal((again.match(/id="rs-theme"/g) || []).length, 1);
  assert.doesNotMatch(again, /rs-fonts/);
  // a light accent gets dark text on it
  assert.match(await applyTheme(design, { colors: { brand: '#fde68a' }, fonts: {} }), /--brand-ink:#111111/);
});

test('bundled font files can be read', async () => {
  const data = await fontFile('inter', 400);
  assert.equal(data.subarray(0, 4).toString(), 'wOF2');
  assert.equal(await fontFile('../../etc/passwd', 400), null);
  assert.equal(await fontFile('inter', 123), null);
});
