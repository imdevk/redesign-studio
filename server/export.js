import { launchBrowser } from './capture.js';

/**
 * Renders a finished design to a PNG so it can be shared as a picture.
 * Scripts are off and all network requests are blocked: the design is fully self-contained.
 */
export async function renderPng(html, { device = 'desktop', chromePath } = {}) {
  const phone = device === 'phone';
  const browser = await launchBrowser({ chromePath });
  try {
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: phone ? 2 : 1,
      javaScriptEnabled: false,
      acceptDownloads: false
    });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    return await page.screenshot({ type: 'png', fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }
}
