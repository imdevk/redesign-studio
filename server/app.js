import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { UserError } from './errors.js';
import { assertAllowed, normalizeUrl } from './urlSafety.js';
import { FONTS, PALETTES, applyTheme, fontFile, readTheme, validateTheme } from './theme.js';
import { MAX_IMAGES, decodeImages, prepareUploads, screenshotSite } from './uploads.js';
import { categories, colorModes, goals, guessCategory, sections, styles, validateAnswers } from './prompt.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DESIGN_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  // "sandbox" gives the page its own opaque origin even when opened in a tab, so it can never touch this tool.
  'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};
const safeName = value => String(value || 'design').replace(/[^a-z0-9.-]/gi, '-').slice(0, 60) || 'design';
const brief = list => list.map(({ value, label, hint }) => ({ value, label, ...(hint ? { hint } : {}) }));

/**
 * Dependencies are passed in so tests can replace the browser and the AI:
 *   capture(url, options) -> { site, shots: { desktop, phone, ai } }
 *   generate({ config, site, answers, screenshot }) -> { html, model, usage }
 *   renderPng(html, { device, chromePath }) -> Buffer
 *   lookup(host, options) -> addresses (optional; defaults to the system DNS)
 */
export function createApp({ config, store, capture, generate, renderPng, staticDir, lookup }) {
  const app = express();
  app.disable('x-powered-by');
  let busy = null; // only one page is processed at a time; this is a personal tool and it protects your credits

  // This server is only meant for you. Refusing other Host and Origin values stops web pages you visit
  // from sending requests to it (DNS rebinding and cross-site requests).
  app.use((req, res, next) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (!LOCAL_HOSTS.has(host)) return res.status(403).json({ error: 'This tool only answers on localhost.' });
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        let originHost = '';
        try { originHost = new URL(origin).hostname.toLowerCase(); } catch { /* rejected below */ }
        if (!LOCAL_HOSTS.has(originHost)) return res.status(403).json({ error: 'Request origin is not allowed.' });
      }
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON requests are required.' });
    }
    next();
  });
  app.use('/api', (_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); next(); });
  // Screenshots arrive as base64 inside JSON, so this one route accepts a larger body than the rest.
  app.post('/api/runs/upload', express.json({ limit: '36mb' }), async (req, res) => {
    const buffers = decodeImages(req.body?.images);
    const prepared = await prepareUploads(buffers);
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const files = prepared.slices.map((_, i) => `upload-${i + 1}.jpg`);
    const site = screenshotSite({ name, files });
    const run = await store.create({ url: '', host: site.host, title: site.title, status: 'captured' });
    try {
      await store.saveSite(run.id, site);
      await Promise.all(prepared.slices.map((data, i) => store.saveFile(run.id, files[i], data)));
      await store.saveFile(run.id, 'original-desktop.jpg', prepared.view.desktop);
      await store.saveFile(run.id, 'original-phone.jpg', prepared.view.phone);
    } catch (error) { await store.remove(run.id).catch(() => {}); throw error; }
    res.status(201).json({ run: summary(run) });
  });
  app.use(express.json({ limit: '32kb' }));

  const aiReady = () => Boolean(config.apiKey && config.model);
  const requireRun = async id => {
    const run = await store.get(id);
    if (!run) throw new UserError('Design not found.', 404);
    return run;
  };
  const summary = run => ({
    id: run.id, url: run.url, host: run.host, title: run.title || '', status: run.status, stage: run.stage, error: run.error,
    warnings: run.warnings, answers: run.answers, usage: run.usage, model: run.model, createdAt: run.createdAt, updatedAt: run.updatedAt
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      ready: aiReady(), model: config.model || null, usesScreenshot: config.useScreenshot, allowPrivate: config.allowPrivate,
      limits: { maxImages: MAX_IMAGES }, options: { categories: brief(categories), goals: brief(goals), styles: brief(styles), sections: brief(sections), colorModes: brief(colorModes), theme: { palettes: PALETTES, fonts: FONTS.map(({ id, label, kind }) => ({ id, label, kind })) } }
    });
  });

  app.get('/api/runs', async (_req, res) => {
    res.json({ items: (await store.list()).map(summary) });
  });

  // Step 1: check the page. Opens the address, reads it and takes screenshots. No AI is used, so it costs nothing.
  app.post('/api/runs', async (req, res) => {
    const url = normalizeUrl(req.body?.url);
    await assertAllowed(url, { allowPrivate: config.allowPrivate, lookup });
    if (busy) throw new UserError('Another page is being processed. Wait for it to finish.', 409);
    const run = await store.create({ url: url.href, host: url.hostname });
    busy = run.id;
    (async () => {
      try {
        const { site, shots } = await capture(url.href, {
          chromePath: config.chromePath, allowPrivate: config.allowPrivate,
          onStage: stage => { store.update(run.id, { stage }).catch(() => {}); }
        });
        const warnings = site.thin ? ['Very little text could be read from this page. It may load its content with JavaScript or block automated visits, so the design may contain placeholders.'] : [];
        await store.saveSite(run.id, { ...site, suggestedCategory: guessCategory(site) });
        await store.saveFile(run.id, 'original-desktop.jpg', shots.desktop);
        await store.saveFile(run.id, 'original-phone.jpg', shots.phone);
        await store.saveFile(run.id, 'ai-view.jpg', shots.ai);
        busy = null; // released before the final status is written, so a quick next request is never refused
        await store.update(run.id, { status: 'captured', stage: '', title: site.title, host: site.host, finalUrl: site.finalUrl, warnings });
      } catch (error) {
        console.error('Checking the page failed:', error?.name || 'Error', error?.expose ? error.message : '');
        busy = null;
        await store.update(run.id, { status: 'failed', stage: '', error: error?.expose ? error.message : 'Something went wrong while checking the page. Please try again.' }).catch(() => {});
      } finally { busy = null; }
    })();
    res.status(202).json({ run: summary(run) });
  });

  app.get('/api/runs/:id', async (req, res) => {
    const run = await requireRun(req.params.id);
    const site = await store.getSite(run.id);
    res.json({ run: summary(run), site, hasDesign: Boolean(await store.readFile(run.id, 'design.html')) });
  });

  app.get('/api/runs/:id/shot/:name', async (req, res) => {
    const file = { desktop: 'original-desktop.jpg', phone: 'original-phone.jpg' }[req.params.name];
    const data = file ? await store.readFile(req.params.id, file) : null;
    if (!data) return res.status(404).json({ error: 'Screenshot not found.' });
    res.type('image/jpeg').send(data);
  });

  // Step 2: design it. Uses the saved page content, the answers and (optionally) the screenshot.
  app.post('/api/runs/:id/generate', async (req, res) => {
    if (!aiReady()) throw new UserError('AI is not set up yet. Add OPENAI_API_KEY and OPENAI_MODEL to .env and restart the tool.', 503);
    const answers = validateAnswers(req.body);
    const run = await requireRun(req.params.id);
    const site = await store.getSite(run.id);
    if (!site) throw new UserError('This page could not be read, so it cannot be redesigned. Check the address again.', 409);
    if (site.source === 'screenshot' && !config.useScreenshot) throw new UserError('Designing from screenshots needs USE_SCREENSHOT=true in .env and a model that accepts images.', 409);
    if (busy) throw new UserError('Another page is being processed. Wait for it to finish.', 409);
    busy = run.id;
    try { await store.update(run.id, { status: 'generating', stage: 'Designing the page', error: '', answers }); }
    catch (error) { busy = null; throw error; }
    (async () => {
      try {
        const fromUpload = site.source === 'screenshot';
        const screenshot = fromUpload ? null : await store.readFile(run.id, 'ai-view.jpg');
        const screenshots = fromUpload ? (await Promise.all((site.uploadFiles || []).map(file => store.readFile(run.id, file)))).filter(Boolean) : [];
        const result = await generate({ config, site, answers, screenshot, screenshots });
        await store.saveFile(run.id, 'design.html', result.html);
        await store.removeFile(run.id, 'export-desktop.png');
        await store.removeFile(run.id, 'export-phone.png');
        busy = null;
        await store.update(run.id, { status: 'done', stage: '', error: '', model: result.model, usage: result.usage, theme: null });
      } catch (error) {
        console.error('Designing failed:', error?.name || 'Error', error?.expose ? error.message : '');
        busy = null;
        await store.update(run.id, { status: 'failed', stage: '', error: error?.expose ? error.message : 'Something went wrong while designing the page. Please try again.' }).catch(() => {});
      } finally { busy = null; }
    })();
    res.status(202).json({ run: summary({ ...run, status: 'generating', answers }) });
  });

  // Colours and fonts: read what the design uses, and save the person's choices. No AI call is involved.
  const themeDetail = async run => {
    const html = await store.readFile(run.id, 'design.html');
    if (!html) throw new UserError('There is no design for this page yet.', 404);
    return { ...readTheme(html.toString('utf8')), chosen: run.theme || { colors: {}, fonts: {} } };
  };
  app.get('/api/runs/:id/theme', async (req, res) => {
    res.json(await themeDetail(await requireRun(req.params.id)));
  });
  app.put('/api/runs/:id/theme', async (req, res) => {
    const run = await requireRun(req.params.id);
    if (busy === run.id) throw new UserError('This design is still being created.', 409);
    const found = await themeDetail(run);
    const theme = validateTheme(req.body);
    // Only roles this design really has can be changed.
    const colorIds = new Set(found.colors.map(c => c.id)), fontIds = new Set(found.fonts.map(f => f.id));
    for (const key of Object.keys(theme.colors)) if (!colorIds.has(key)) delete theme.colors[key];
    for (const key of Object.keys(theme.fonts)) if (!fontIds.has(key)) delete theme.fonts[key];
    const next = await store.update(run.id, { theme });
    await store.removeFile(run.id, 'export-desktop.png');
    await store.removeFile(run.id, 'export-phone.png');
    res.json({ ...found, chosen: theme, updatedAt: next.updatedAt });
  });
  // Font files for the tool's own picker, so every option is shown in its own typeface.
  app.get('/api/fonts/:id/:weight.woff2', async (req, res) => {
    const data = await fontFile(req.params.id, Number(req.params.weight));
    if (!data) return res.status(404).json({ error: 'Font not found.' });
    res.set({ 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=86400' }).send(data);
  });

  // The design itself: shown in the tool inside a sandboxed frame, opened in its own tab, or downloaded.
  app.get('/api/runs/:id/design.html', async (req, res) => {
    const run = await requireRun(req.params.id);
    const html = await store.readFile(run.id, 'design.html');
    if (!html) throw new UserError('There is no design for this page yet.', 404);
    res.set(DESIGN_HEADERS);
    if (req.query.download) res.set('Content-Disposition', `attachment; filename="${safeName(run.host)}-redesign.html"`);
    res.send(await applyTheme(html.toString('utf8'), run.theme));
  });

  app.get('/api/runs/:id/export.png', async (req, res) => {
    const device = req.query.device === 'phone' ? 'phone' : 'desktop';
    const run = await requireRun(req.params.id);
    const html = await store.readFile(run.id, 'design.html');
    if (!html) throw new UserError('There is no design for this page yet.', 404);
    const cache = `export-${device}.png`;
    let png = await store.readFile(run.id, cache);
    if (!png) { png = await renderPng(await applyTheme(html.toString('utf8'), run.theme), { device, chromePath: config.chromePath }); await store.saveFile(run.id, cache, png); }
    res.set({ 'Content-Disposition': `attachment; filename="${safeName(run.host)}-redesign-${device}.png"`, 'Content-Type': 'image/png' }).send(png);
  });

  app.delete('/api/runs/:id', async (req, res) => {
    const run = await requireRun(req.params.id);
    if (busy === run.id) throw new UserError('This design is still being processed.', 409);
    await store.remove(run.id);
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, dotfiles: 'deny' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error?.expose) return res.status(error.status || 422).json({ error: error.message });
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request data.' });
    console.error('Unexpected error:', error?.name, error?.message);
    res.status(500).json({ error: 'Something went wrong. Check the terminal for details.' });
  });

  return app;
}
