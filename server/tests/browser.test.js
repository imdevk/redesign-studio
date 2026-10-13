import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { capturePage, launchBrowser } from '../capture.js';
import { renderPng } from '../export.js';

// These tests need a real Chromium. They are skipped when one cannot start
// (run `npm run setup`, or set CHROME_PATH in the environment).
const chromePath = process.env.CHROME_PATH || '';
let available = false;
try { const b = await launchBrowser({ chromePath }); await b.close(); available = true; } catch { /* skipped below */ }
const opts = { skip: available ? false : 'Chromium is not available (run npm run setup or set CHROME_PATH)' };

const fixture = await readFile(new URL('./fixtures/restaurant.html', import.meta.url));
const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(fixture); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
test.after(() => server.close());

test('capture reads content, colours and picture spots from a real page', opts, async () => {
  const { site, shots } = await capturePage(`http://127.0.0.1:${server.address().port}/`, { chromePath, allowPrivate: true });
  assert.match(site.title, /Ember/);
  assert.ok(site.headings.length >= 3);
  assert.ok(site.colors.accents.includes('#c2410c'));
  const roles = new Set(site.images.map(i => i.role));
  for (const role of ['logo', 'hero', 'content', 'avatar']) assert.ok(roles.has(role), `missing ${role}`);
  assert.equal(shots.desktop[0], 0xff); // JPEG
  assert.ok(shots.phone.length > 1000);
});

test('PNG export renders a design with scripts and network off', opts, async () => {
  const png = await renderPng('<!doctype html><body style="margin:0"><h1>Hi</h1><script>document.body.innerHTML=""</script><img src="http://example.com/x.png"></body>', { device: 'phone', chromePath });
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('private addresses are refused without the override', opts, async () => {
  await assert.rejects(() => capturePage(`http://127.0.0.1:${server.address().port}/`, { chromePath }), /private|local/i);
});
