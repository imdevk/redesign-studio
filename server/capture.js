import { chromium } from 'playwright';
import { UserError } from './errors.js';
import { assertAllowed, normalizeUrl } from './urlSafety.js';
import { summarizeColors } from './colors.js';

export async function launchBrowser({ chromePath } = {}) {
  const args = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox'); // only needed when running as root, for example in a container
  try {
    return await chromium.launch({ headless: true, executablePath: chromePath || undefined, args });
  } catch (error) {
    const reason = String(error?.message || '');
    if (/Executable doesn't exist|executable path|ENOENT/i.test(reason)) {
      throw new UserError('The browser is not installed yet. Run "npm run setup" once, or set CHROME_PATH in .env to your own Chrome.', 500);
    }
    throw new UserError(`The browser could not start: ${reason.split('\n')[0].slice(0, 160)}`, 500);
  }
}

function navigationError(error) {
  const text = String(error?.message || '');
  if (/ERR_NAME_NOT_RESOLVED/.test(text)) return new UserError('That website address could not be found. Check the spelling and your internet connection.');
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(text)) return new UserError('The website refused the connection.');
  if (/ERR_CERT|SSL/.test(text)) return new UserError('The website has a security certificate problem, so the browser would not open it.');
  if (/Timeout|ERR_TIMED_OUT/.test(text)) return new UserError('The website took too long to load.');
  return new UserError('The page could not be opened. Check the address and that the site is online.');
}

/**
 * Runs inside the page. Returns what a designer needs: the words, the order of sections,
 * where the pictures are and what shape they are, plus colour samples taken from what is really on screen.
 */
function collectPage() {
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const rgba = value => {
    if (colorCache.has(value)) return colorCache.get(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const out = [d[0], d[1], d[2], d[3] / 255];
    colorCache.set(value, out);
    return out;
  };
  const docHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const width = window.innerWidth;
  const top = el => el.getBoundingClientRect().top + window.scrollY;
  const unique = (items, limit, max) => {
    const seen = new Set(); const out = [];
    for (const item of items) {
      const value = clean(item).slice(0, max);
      const key = value.toLowerCase();
      if (value.length < 2 || seen.has(key)) continue;
      seen.add(key); out.push(value);
      if (out.length >= limit) break;
    }
    return out;
  };

  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'HEAD']);
  const visible = [];
  for (const el of Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, 3500)) {
    if (skipTags.has(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) continue;
    visible.push({ el, r, s });
  }

  // Colours
  const samples = [];
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  for (const value of [bodyBg, htmlBg]) samples.push({ rgba: rgba(value), weight: 1.4, kind: 'bg' });
  for (const { el, r, s } of visible.slice(0, 1800)) {
    const area = Math.min(r.width, width) * Math.min(r.height, 1400) / (width * 900);
    const isAction = el.matches('a, button, [role="button"], input[type="submit"]');
    const bg = rgba(s.backgroundColor);
    if (bg[3] > 0.5) samples.push({ rgba: bg, weight: Math.min(area, 1.5), kind: 'bg' });
    if (isAction && bg[3] > 0.5) samples.push({ rgba: bg, weight: 1, kind: 'accent' });
    if (el.matches('a') && !el.closest('nav, footer')) samples.push({ rgba: rgba(s.color), weight: 0.25, kind: 'accent' });
    let own = 0;
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent.trim().length;
    if (own > 0) samples.push({ rgba: rgba(s.color), weight: own, kind: 'text' });
    if (/^H[1-3]$/.test(el.tagName)) samples.push({ rgba: rgba(s.color), weight: 0.3, kind: 'accent' });
  }

  // Text
  const textOf = el => clean(el.innerText || el.textContent);
  const inVisible = new Set(visible.map(v => v.el));
  const shown = selector => Array.from(document.querySelectorAll(selector)).filter(el => inVisible.has(el));
  const headings = shown('h1, h2, h3').map(el => ({ level: Number(el.tagName[1]), text: textOf(el).slice(0, 140), y: Math.round(top(el)) })).filter(h => h.text.length > 1).slice(0, 30);
  const paragraphs = unique(shown('p, li, blockquote, dd, figcaption').map(textOf).filter(t => t.length >= 25 && t.length <= 600), 40, 260);
  const navigation = unique(shown('nav a, header a').map(textOf).filter(t => t.length <= 40), 14, 40);
  const buttons = unique(shown('button, [role="button"], a[class*="btn"], a[class*="button"], a[class*="cta"], input[type="submit"]').map(el => textOf(el) || el.value || '').filter(t => t.length <= 40), 10, 40);

  // Order and make-up of the page
  const sectionEls = Array.from(document.querySelectorAll('header, main > *, body > section, section, footer, [role="banner"], [role="contentinfo"]'))
    .filter(el => inVisible.has(el) && el.getBoundingClientRect().height > 110)
    .filter((el, _, all) => !all.some(other => other !== el && other.contains(el) && other.tagName === 'SECTION' && el.tagName === 'SECTION'));
  const sections = sectionEls.map(el => {
    const heading = el.querySelector('h1, h2, h3');
    const imgs = Array.from(el.querySelectorAll('img, picture, video')).filter(i => { const r = i.getBoundingClientRect(); return r.width >= 90 && r.height >= 60; }).length;
    return {
      kind: el.tagName === 'HEADER' || el.getAttribute('role') === 'banner' ? 'header' : el.tagName === 'FOOTER' || el.getAttribute('role') === 'contentinfo' ? 'footer' : 'section',
      heading: heading ? textOf(heading).slice(0, 100) : '',
      y: Math.round(top(el)),
      height: Math.round(el.getBoundingClientRect().height),
      images: imgs,
      buttons: el.querySelectorAll('button, [role="button"], a[class*="btn"], a[class*="button"]').length,
      textLength: textOf(el).length
    };
  }).sort((a, b) => a.y - b.y).slice(0, 18);

  // Where the pictures are
  const shapeOf = (w, h) => { const q = w / h; return q > 2.2 ? 'banner' : q > 1.5 ? 'wide' : q > 1.15 ? 'photo' : q > 0.9 ? 'square' : 'portrait'; };
  const imageCandidates = [];
  for (const { el, r, s } of visible) {
    let kind = '';
    if (el.tagName === 'IMG' || (el.tagName === 'VIDEO' && el.poster)) kind = 'img';
    else if (s.backgroundImage && s.backgroundImage !== 'none' && /url\(/.test(s.backgroundImage)) kind = 'background';
    if (!kind) continue;
    const label = `${el.getAttribute('alt') || ''} ${el.getAttribute('src') || ''} ${el.className && el.className.baseVal === undefined ? el.className : ''} ${el.id || ''}`;
    const inHeader = !!el.closest('header, nav');
    const looksLikeLogo = /logo|brand/i.test(label) || (inHeader && r.height < 120 && r.width < 320);
    if (!looksLikeLogo && (r.width < 90 || r.height < 60)) continue;
    if (looksLikeLogo && (r.width < 36 || r.height < 14)) continue;
    const y = top(el);
    let role = 'content';
    if (looksLikeLogo) role = 'logo';
    else if (Math.abs(r.width - r.height) < 12 && r.width < 220 && parseFloat(s.borderTopLeftRadius) >= r.width / 2 - 2) role = 'avatar';
    else if (y < 900 && r.width >= 600) role = 'hero';
    // Prefer the heading of the section the picture sits in; fall back to the nearest heading above it.
    const scope = el.closest('section, article');
    const own = scope ? scope.querySelector('h1, h2, h3') : null;
    const before = own ? { text: textOf(own) } : headings.filter(h => h.y <= y + 4).pop();
    imageCandidates.push({
      role,
      shape: role === 'avatar' ? 'square' : shapeOf(r.width, r.height),
      width: Math.round(r.width), height: Math.round(r.height), y: Math.round(y),
      alt: clean(el.getAttribute('alt')).slice(0, 100),
      nearHeading: before ? before.text.slice(0, 80) : ''
    });
  }
  const images = imageCandidates.sort((a, b) => a.y - b.y).slice(0, 20);

  // Contact and links
  const hrefs = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href') || '');
  const emails = unique(hrefs.filter(h => /^mailto:/i.test(h)).map(h => h.replace(/^mailto:/i, '').split('?')[0]), 3, 120);
  const phones = unique(hrefs.filter(h => /^tel:/i.test(h)).map(h => h.replace(/^tel:/i, '')), 3, 40);
  const socials = unique(hrefs.map(h => { try { return new URL(h, location.href).hostname.replace(/^www\./, ''); } catch { return ''; } })
    .filter(h => /(^|\.)(facebook|instagram|linkedin|twitter|x|youtube|tiktok|wa|whatsapp|pinterest)\.(com|me)$/.test(h)), 6, 40);

  const metaContent = selector => { const m = document.querySelector(selector); return m ? clean(m.getAttribute('content')) : ''; };
  const firstFamily = el => (el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : '');
  const logoImg = Array.from(document.querySelectorAll('img')).find(i => /logo/i.test(`${i.alt} ${i.src} ${i.className}`));

  return {
    title: clean(document.title).slice(0, 160),
    description: (metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]')).slice(0, 300),
    siteName: (metaContent('meta[property="og:site_name"]') || (logoImg ? clean(logoImg.alt) : '')).slice(0, 80),
    language: clean(document.documentElement.lang).slice(0, 12),
    themeColor: metaContent('meta[name="theme-color"]'),
    fonts: { heading: firstFamily(document.querySelector('h1, h2')), body: firstFamily(document.body) },
    docHeight, headings, paragraphs, navigation, buttons, sections, images,
    contact: { emails, phones }, socials,
    colorSamples: samples.slice(0, 2500)
  };
}

const withDeadline = (promise, ms, onTimeout) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { onTimeout?.(); reject(new UserError('Checking the page took too long. The site may be very heavy or blocking automated visits.')); }, ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

/**
 * Opens one page (exactly the address entered, not the whole site), reads it and takes screenshots.
 * Returns { site, shots: { desktop, phone, ai } } where shots are JPEG buffers.
 */
export async function capturePage(input, { chromePath, allowPrivate = false, onStage = () => {}, timeoutMs = 30000, deadlineMs = 90000 } = {}) {
  const url = normalizeUrl(input);
  await assertAllowed(url, { allowPrivate });
  onStage('Starting the browser');
  const browser = await launchBrowser({ chromePath });
  const run = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', route => (route.request().resourceType() === 'media' ? route.abort() : route.continue()));
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    onStage('Opening the page');
    let response;
    try { response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }); }
    catch (error) { throw navigationError(error); }
    if (response && response.status() >= 400) throw new UserError(`The website answered with an error (HTTP ${response.status()}). It may block automated visits.`);
    const finalUrl = new URL(page.url());
    await assertAllowed(finalUrl, { allowPrivate });
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});

    onStage('Scrolling through the page');
    await page.evaluate(async () => {
      const limit = Math.min(document.documentElement.scrollHeight, 9000);
      for (let y = 0; y < limit; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 160)); }
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 400));
    });

    onStage('Reading the content');
    const data = await page.evaluate(collectPage);

    onStage('Taking screenshots');
    const clip = height => ({ x: 0, y: 0, width: 1440, height: Math.max(200, Math.min(data.docHeight, height)) });
    const desktop = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: true, clip: clip(6000) });
    const ai = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true, clip: clip(2600) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(900);
    const phoneHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    const phone = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.max(300, Math.min(phoneHeight, 2400)) } });

    const { colorSamples, ...rest } = data;
    const colors = summarizeColors(colorSamples);
    if (data.themeColor && /^#[0-9a-f]{6}$/i.test(data.themeColor) && !colors.accents.includes(data.themeColor.toLowerCase())) colors.accents.unshift(data.themeColor.toLowerCase());
    const textLength = rest.paragraphs.join('').length + rest.headings.map(h => h.text).join('').length;
    const site = {
      ...rest, colors: { ...colors, accents: colors.accents.slice(0, 4) },
      url: url.href, finalUrl: finalUrl.href, host: finalUrl.hostname, textLength, thin: textLength < 250
    };
    return { site, shots: { desktop, phone, ai } };
  };
  try { return await withDeadline(run(), deadlineMs, () => browser.close().catch(() => {})); }
  finally { await browser.close().catch(() => {}); }
}
