import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { createStore } from '../store.js';
import sharp from 'sharp';
import { UserError } from '../errors.js';
import { sanitizeDocument } from '../sanitize.js';

const SITE = {
  host: 'shop.example.com', finalUrl: 'https://shop.example.com/', url: 'https://shop.example.com/', title: 'Green Leaf Plants', description: '', siteName: 'Green Leaf', language: 'en',
  fonts: { heading: 'Georgia', body: 'Georgia' }, headings: [{ level: 1, text: 'Plants for every room', y: 10 }], paragraphs: ['Plants and pots delivered carefully to your door.'], navigation: ['Shop'], buttons: ['Shop now'],
  sections: [], images: [{ role: 'hero', shape: 'wide', width: 800, height: 400, alt: 'Plants', nearHeading: '' }], contact: { emails: [], phones: [] }, socials: [],
  colors: { background: '#ffffff', text: '#111111', accents: ['#15803d'], surfaces: [] }, textLength: 400, thin: false
};
const answers = { category: 'ecommerce', goal: 'buy', style: 'minimal', colorMode: 'keep', customColor: '', sections: ['about', 'contact'], notes: '' };
const page = `<html><body><h1>Green Leaf</h1><p>${'Plants and pots for every room in the house, delivered with care. '.repeat(4)}</p><script>alert(1)</script></body></html>`;

async function start({ ready = true, capture, generate, renderPng, useScreenshot = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rs-test-'));
  const store = createStore(dir);
  const calls = { capture: [], generate: [], render: [] };
  const config = { apiKey: ready ? 'sk-test' : '', model: ready ? 'test-model' : '', useScreenshot, allowPrivate: false, maxOutputTokens: 1000, chromePath: '', dataDir: dir };
  const app = createApp({
    config, store, lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    capture: capture || (async (url, opts) => { calls.capture.push(url); opts.onStage?.('Opening the page'); return { site: SITE, shots: { desktop: Buffer.from('d'), phone: Buffer.from('p'), ai: Buffer.from('a') } }; }),
    generate: generate || (async args => { calls.generate.push(args); return { html: sanitizeDocument(page, { brand: '#15803d' }), model: 'test-model', usage: { input: 1200, output: 3400 } }; }),
    renderPng: renderPng || (async (html, opts) => { calls.render.push(opts.device); return Buffer.from(`PNG-${opts.device}`); })
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (p, method = 'GET', payload, headers = {}) => fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
  const json = async res => res.json();
  const settle = async id => {
    for (let i = 0; i < 80; i += 1) {
      const { run } = await json(await call(`/api/runs/${id}`));
      if (!['capturing', 'generating'].includes(run.status)) return run;
      await new Promise(r => setTimeout(r, 15));
    }
    throw new Error('never settled');
  };
  return { call, json, settle, calls, store, port: server.address().port, close: async () => { await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 }); } };
}

test('only requests that really come from this computer are accepted', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('/api/status')).status, 200);
    const raw = (headers, method = 'GET', body) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: app.port, path: method === 'GET' ? '/api/status' : '/api/runs', method, headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); if (body) req.write(body); req.end();
    });
    assert.equal(await raw({ host: 'evil.example.com' }), 403, 'DNS rebinding: unknown Host');
    assert.equal(await raw({ host: `localhost:${app.port}` }), 200);
    const json = { 'content-type': 'application/json' };
    assert.equal((await app.call('/api/runs', 'POST', { url: 'example.com' }, { origin: 'https://attacker.test' })).status, 403, 'cross-site origin');
    assert.equal((await app.call('/api/runs', 'POST', { url: 'shop.example.com' }, { origin: 'http://localhost:5173' })).status, 202, 'the dev UI origin is fine');
    assert.equal(await raw({ host: `127.0.0.1:${app.port}`, 'content-type': 'text/plain' }, 'POST', 'url=example.com'), 415);
    void json;
  } finally { await app.close(); }
});

test('status reports setup and the questions that will be asked', async () => {
  const app = await start({ ready: false });
  try {
    const status = await app.json(await app.call('/api/status'));
    assert.equal(status.ready, false);
    assert.ok(status.options.categories.length > 5 && status.options.styles.every(s => s.hint) && status.options.sections.length > 5);
    assert.deepEqual(status.options.colorModes.map(c => c.value), ['keep', 'fresh', 'custom']);
    assert.equal(JSON.stringify(status).includes('sk-'), false);
  } finally { await app.close(); }
});

test('check the page, answer the questions, get a design, export it, delete it', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('/api/runs', 'POST', { url: '' })).status, 400);
    assert.equal((await app.call('/api/runs', 'POST', { url: 'http://127.0.0.1:9' })).status, 400, 'local addresses are refused');
    assert.equal((await app.call('/api/runs', 'POST', { url: 'http://169.254.169.254/' })).status, 400);
    const started = await app.call('/api/runs', 'POST', { url: 'shop.example.com' });
    assert.equal(started.status, 202);
    const { run } = await app.json(started);
    assert.equal(run.status, 'capturing');
    const checked = await app.settle(run.id);
    assert.equal(checked.status, 'captured'); assert.equal(checked.title, 'Green Leaf Plants'); assert.deepEqual(app.calls.capture, ['https://shop.example.com/']);
    const detail = await app.json(await app.call(`/api/runs/${run.id}`));
    assert.equal(detail.site.suggestedCategory, 'ecommerce'); assert.equal(detail.site.colors.accents[0], '#15803d'); assert.equal(detail.hasDesign, false);
    for (const device of ['desktop', 'phone']) { const res = await app.call(`/api/runs/${run.id}/shot/${device}`); assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/jpeg'); }
    assert.equal((await app.call(`/api/runs/${run.id}/shot/other`)).status, 404);
    assert.equal((await app.call(`/api/runs/${run.id}/design.html`)).status, 404, 'no design yet');

    assert.equal((await app.call(`/api/runs/${run.id}/generate`, 'POST', { ...answers, category: 'nope' })).status, 400);
    const gen = await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    assert.equal(gen.status, 202);
    assert.equal((await app.settle(run.id)).status, 'done');
    const done = await app.json(await app.call(`/api/runs/${run.id}`));
    assert.deepEqual(done.run.usage, { input: 1200, output: 3400 }); assert.deepEqual(done.run.answers, answers); assert.equal(done.hasDesign, true);
    assert.equal(app.calls.generate[0].screenshot.toString(), 'a', 'the stored screenshot goes to the AI');
    assert.equal(app.calls.generate[0].site.host, 'shop.example.com');

    const design = await app.call(`/api/runs/${run.id}/design.html`);
    assert.equal(design.status, 200);
    assert.match(design.headers.get('content-security-policy'), /^sandbox; default-src 'none'/);
    assert.equal(design.headers.get('x-content-type-options'), 'nosniff');
    const html = await design.text();
    assert.ok(html.includes('rs-placeholders') && !html.includes('alert(1)'));
    const download = await app.call(`/api/runs/${run.id}/design.html?download=1`);
    assert.match(download.headers.get('content-disposition'), /attachment; filename="shop.example.com-redesign.html"/);

    const png = await app.call(`/api/runs/${run.id}/export.png?device=phone`);
    assert.equal(png.headers.get('content-type'), 'image/png'); assert.equal(await png.text(), 'PNG-phone');
    await app.call(`/api/runs/${run.id}/export.png?device=phone`);
    assert.deepEqual(app.calls.render, ['phone'], 'the picture is rendered once and then reused');
    assert.equal(await (await app.call(`/api/runs/${run.id}/export.png`)).text(), 'PNG-desktop');

    const list = await app.json(await app.call('/api/runs'));
    assert.equal(list.items.length, 1); assert.equal(list.items[0].host, 'shop.example.com');
    assert.equal((await app.call(`/api/runs/${run.id}`, 'DELETE', {})).status, 200);
    assert.equal((await app.call(`/api/runs/${run.id}`)).status, 404);
    assert.equal((await app.call('/api/runs/not-an-id')).status, 400);
  } finally { await app.close(); }
});

test('designing needs the AI to be set up, and the page can be checked without it', async () => {
  const app = await start({ ready: false });
  try {
    const { run } = await app.json(await app.call('/api/runs', 'POST', { url: 'shop.example.com' }));
    assert.equal((await app.settle(run.id)).status, 'captured');
    const res = await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    assert.equal(res.status, 503); assert.match((await app.json(res)).error, /OPENAI_API_KEY/);
  } finally { await app.close(); }
});

test('problems are explained, and a failed design can be tried again without re-reading the page', async () => {
  let attempts = 0;
  const app = await start({
    capture: async url => { if (url.includes('blocked')) throw new UserError('The website answered with an error (HTTP 403). It may block automated visits.'); return { site: SITE, shots: { desktop: Buffer.from('d'), phone: Buffer.from('p'), ai: Buffer.from('a') } }; },
    generate: async () => { attempts += 1; if (attempts === 1) throw new UserError('OpenAI reports no remaining credits or quota on this API key.', 502); if (attempts === 2) throw new Error('secret internal detail sk-leak'); return { html: sanitizeDocument(page), model: 'm', usage: { input: 1, output: 2 } }; }
  });
  const logged = []; const original = console.error; console.error = (...a) => logged.push(a.join(' '));
  try {
    const bad = (await app.json(await app.call('/api/runs', 'POST', { url: 'blocked.example.com' }))).run;
    const failedCapture = await app.settle(bad.id);
    assert.equal(failedCapture.status, 'failed'); assert.match(failedCapture.error, /HTTP 403/);
    assert.equal((await app.call(`/api/runs/${bad.id}/generate`, 'POST', answers)).status, 409, 'nothing was read, so nothing can be designed');

    const { run } = await app.json(await app.call('/api/runs', 'POST', { url: 'shop.example.com' }));
    await app.settle(run.id);
    await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    const first = await app.settle(run.id); assert.equal(first.status, 'failed'); assert.match(first.error, /no remaining credits/);
    await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    const second = await app.settle(run.id); assert.equal(second.status, 'failed'); assert.match(second.error, /Something went wrong/); assert.ok(!second.error.includes('sk-leak'));
    const detail = await app.json(await app.call(`/api/runs/${run.id}`));
    assert.ok(detail.site, 'the page content is kept so the questions stay available');
    await app.call(`/api/runs/${run.id}/generate`, 'POST', { ...answers, style: 'bold' });
    const third = await app.settle(run.id); assert.equal(third.status, 'done'); assert.equal(third.answers.style, 'bold'); assert.equal(third.error, '');
    assert.equal(attempts, 3);
  } finally { console.error = original; await app.close(); }
});

test('one page is processed at a time', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const app = await start({ capture: async () => { await gate; return { site: SITE, shots: { desktop: Buffer.from('d'), phone: Buffer.from('p'), ai: Buffer.from('a') } }; } });
  try {
    const first = await app.call('/api/runs', 'POST', { url: 'shop.example.com' });
    assert.equal(first.status, 202);
    const second = await app.call('/api/runs', 'POST', { url: 'another.example.com' });
    assert.equal(second.status, 409); assert.match((await app.json(second)).error, /Another page/);
    const { run } = await app.json(first);
    assert.equal((await app.call(`/api/runs/${run.id}`, 'DELETE', {})).status, 409, 'cannot delete while it is running');
    release(); assert.equal((await app.settle(run.id)).status, 'captured');
    assert.equal((await app.call('/api/runs', 'POST', { url: 'another.example.com' })).status, 202);
  } finally { release(); await app.close(); }
});

test('runs interrupted by a restart are settled', async () => {
  const app = await start();
  try {
    const stuck = await app.store.create({ url: 'https://x.example.com/', host: 'x.example.com' });
    await app.store.settleInterrupted();
    const run = await app.store.get(stuck.id);
    assert.equal(run.status, 'failed'); assert.match(run.error, /interrupted/);
  } finally { await app.close(); }
});

test('colours and fonts can be changed without calling the AI again', async () => {
  const themed = `<html><head><style>:root{--brand:#15803d;--brand-ink:#fff;--bg:#ffffff;--text:#111111;--font-heading:Georgia,serif;--font-body:system-ui}body{background:var(--bg);color:var(--text)}</style></head><body><h1>Green Leaf</h1><p>${'Plants and pots for every room in the house, delivered with care. '.repeat(4)}</p></body></html>`;
  const app = await start({ generate: async () => ({ html: sanitizeDocument(themed, { brand: '#15803d' }), model: 'm', usage: { input: 1, output: 2 } }) });
  try {
    const { run } = await app.json(await app.call('/api/runs', 'POST', { url: 'shop.example.com' }));
    await app.settle(run.id);
    assert.equal((await app.call(`/api/runs/${run.id}/theme`)).status, 404, 'no design yet');
    await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    await app.settle(run.id);

    const found = await app.json(await app.call(`/api/runs/${run.id}/theme`));
    assert.deepEqual(found.colors.map(c => c.id), ['brand', 'bg', 'text']);
    assert.deepEqual(found.fonts.map(f => [f.id, f.current.id]), [['heading', 'system-serif'], ['body', 'system-sans']]);

    await app.call(`/api/runs/${run.id}/export.png?device=phone`);
    const put = await app.call(`/api/runs/${run.id}/theme`, 'PUT', { colors: { brand: '#be185d', surface: '#ffeeee' }, fonts: { heading: 'playfair-display' } });
    assert.equal(put.status, 200);
    assert.deepEqual((await app.json(put)).chosen, { colors: { brand: '#be185d' }, fonts: { heading: 'playfair-display' } }, 'roles the design does not have are dropped');
    assert.equal(app.calls.generate?.length ?? 0, 0);

    const html = await (await app.call(`/api/runs/${run.id}/design.html?download=1`)).text();
    assert.match(html, /--brand:#be185d!important/);
    assert.match(html, /RS Playfair Display/);
    await app.call(`/api/runs/${run.id}/export.png?device=phone`);
    assert.equal(app.calls.render.length, 2, 'a changed theme is not served from the old picture cache');

    assert.equal((await app.call(`/api/runs/${run.id}/theme`, 'PUT', { colors: { brand: 'pink' } })).status, 400);
    assert.equal((await app.call(`/api/runs/${run.id}/theme`, 'PUT', { fonts: { body: 'nope' } })).status, 400);
    assert.equal((await app.call('/api/fonts/inter/400.woff2')).status, 200);
    assert.equal((await app.call('/api/fonts/nope/400.woff2')).status, 404);

    await app.call(`/api/runs/${run.id}/theme`, 'PUT', { colors: {}, fonts: {} });
    assert.doesNotMatch(await (await app.call(`/api/runs/${run.id}/design.html`)).text(), /rs-theme/, 'reset gives back the original');
  } finally { await app.close(); }
});

const shot = async (width, height, color = '#c2410c', format = 'png') => (await sharp({ create: { width, height, channels: 3, background: color } })[format]().toBuffer()).toString('base64');

test('a page can be given as screenshots instead of an address', async () => {
  const seen = [];
  const app = await start({ generate: async args => { seen.push(args); return { html: sanitizeDocument(page, { brand: '#c2410c' }), model: 'm', usage: { input: 1, output: 2 } }; } });
  try {
    const made = await app.call('/api/runs/upload', 'POST', { name: 'Ember & Oak', images: [{ data: await shot(1440, 5200) }, { data: await shot(390, 800, '#0e7490', 'jpeg') }] });
    assert.equal(made.status, 201);
    const { run } = await app.json(made);
    const detail = await app.json(await app.call(`/api/runs/${run.id}`));
    assert.equal(detail.run.status, 'captured');
    assert.equal(detail.run.host, 'Ember & Oak');
    assert.equal(detail.site.source, 'screenshot');
    assert.ok(detail.site.uploadFiles.length >= 3, 'a long page is cut into readable pieces');
    assert.equal((await app.call(`/api/runs/${run.id}/shot/desktop`)).status, 200);
    assert.equal((await app.call(`/api/runs/${run.id}/shot/phone`)).status, 200);

    await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    assert.equal((await app.settle(run.id)).status, 'done');
    assert.equal(seen[0].screenshot, null);
    assert.equal(seen[0].screenshots.length, detail.site.uploadFiles.length);
    assert.equal(seen[0].screenshots[0][0], 0xff, 'JPEG pieces');
  } finally { await app.close(); }
});

test('bad uploads are explained', async () => {
  const app = await start();
  try {
    const up = body => app.call('/api/runs/upload', 'POST', body);
    assert.equal((await up({ images: [] })).status, 400);
    assert.equal((await up({})).status, 400);
    const five = await Promise.all([1, 2, 3, 4, 5].map(async () => ({ data: await shot(300, 300) })));
    assert.equal((await up({ images: five })).status, 400, 'too many');
    const text = Buffer.from('not a picture, just some words '.repeat(10)).toString('base64');
    const notImage = await up({ images: [{ data: text }] });
    assert.equal(notImage.status, 415); assert.match((await app.json(notImage)).error, /PNG, JPG or WebP/);
    const tiny = await up({ images: [{ data: await shot(100, 100) }] });
    assert.equal(tiny.status, 422); assert.match((await app.json(tiny)).error, /too small/);
    assert.equal((await app.json(await app.call('/api/runs'))).items.length, 0, 'nothing is left behind');
    assert.equal((await app.call('/api/runs/upload', 'POST', { images: [{ data: await shot(300, 300) }] }, { origin: 'https://attacker.test' })).status, 403);
  } finally { await app.close(); }
});

test('screenshots need the screenshot setting and the AI', async () => {
  const app = await start({ useScreenshot: false });
  try {
    const { run } = await app.json(await app.call('/api/runs/upload', 'POST', { images: [{ data: await shot(800, 900) }] }));
    const res = await app.call(`/api/runs/${run.id}/generate`, 'POST', answers);
    assert.equal(res.status, 409); assert.match((await app.json(res)).error, /USE_SCREENSHOT=true/);
  } finally { await app.close(); }
});
