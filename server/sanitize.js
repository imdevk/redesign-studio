import * as cheerio from 'cheerio';
import { UserError } from './errors.js';
import { inkFor } from './colors.js';

// The AI's HTML is treated as untrusted. It is cleaned here, locked down with its own Content-Security-Policy,
// and shown in a sandboxed frame. Pictures become theme-coloured placeholders styled by the CSS below.

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

const MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='3' y='4' width='18' height='16' rx='2.5' fill='none' stroke='black' stroke-width='1.7'/%3E%3Ccircle cx='9' cy='9.5' r='1.7' fill='black'/%3E%3Cpath d='M4 18l5-5 4 4 3-3 4 4' fill='none' stroke='black' stroke-width='1.7' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E")`;

/** Shared styling for picture placeholders. Everything derives from --brand so they match the design's theme. */
export function placeholderCss(brand) {
  return `:root{--brand:${brand};--brand-ink:${inkFor(brand)}}
.ph{--ph-mask:${MASK};--ph-a:color-mix(in srgb,var(--brand) 22%,#fff);--ph-b:color-mix(in srgb,var(--brand) 8%,#fff);--ph-line:color-mix(in srgb,var(--brand) 9%,transparent);--ph-icon:color-mix(in srgb,var(--brand) 58%,#fff);--ph-text:color-mix(in srgb,var(--brand) 72%,#000);--ph-tag:rgba(255,255,255,.74);position:relative;display:block;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:var(--ph-radius,14px);background:repeating-linear-gradient(135deg,transparent 0 14px,var(--ph-line) 14px 15px),linear-gradient(135deg,var(--ph-a),var(--ph-b));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brand) 16%,transparent)}
.ph::after{content:"";position:absolute;left:50%;top:50%;width:clamp(28px,16%,64px);aspect-ratio:1;transform:translate(-50%,-58%);background:var(--ph-icon);-webkit-mask:var(--ph-mask) center/contain no-repeat;mask:var(--ph-mask) center/contain no-repeat}
.ph[data-label]::before{content:attr(data-label);position:absolute;left:10px;bottom:10px;max-width:calc(100% - 20px);padding:4px 10px;border-radius:999px;background:var(--ph-tag);color:var(--ph-text);font:600 11px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph-wide{aspect-ratio:16/9}.ph-photo{aspect-ratio:4/3}.ph-square{aspect-ratio:1}.ph-portrait{aspect-ratio:3/4}.ph-banner{aspect-ratio:21/9}
.ph-avatar{aspect-ratio:1;width:var(--ph-size,64px);border-radius:50%}.ph-avatar::before{display:none}.ph-avatar::after{width:42%;transform:translate(-50%,-50%)}
.ph-logo{aspect-ratio:3/1;width:var(--ph-size,132px);border-radius:8px}.ph-logo::before{display:none}.ph-logo::after{width:auto;height:46%;transform:translate(-50%,-50%)}
.ph-dark{--ph-a:color-mix(in srgb,var(--brand) 42%,#0b0d14);--ph-b:color-mix(in srgb,var(--brand) 24%,#0b0d14);--ph-line:rgba(255,255,255,.06);--ph-icon:color-mix(in srgb,var(--brand) 40%,#fff);--ph-text:#fff;--ph-tag:rgba(0,0,0,.38)}`;
}

function cleanCss(css) {
  return String(css)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)\s*(?!data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,])[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, 'none(')
    .replace(/-moz-binding\s*:[^;}]*/gi, '')
    .replace(/behavior\s*:[^;}]*/gi, '');
}

const trimLabel = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * Turns model output into a document that is safe to preview and download.
 * brand is the fallback theme colour used if the design forgot to set --brand.
 */
export function sanitizeDocument(raw, { brand = '#4f46e5' } = {}) {
  let source = String(raw || '').trim();
  const fenced = source.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) source = fenced[1].trim();
  const start = source.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) source = source.slice(start);
  if (!/<(html|body)[\s>]/i.test(source)) throw new UserError('The AI did not return a web page. Please try again.', 502);
  if (source.length > 800_000) throw new UserError('The generated page was too large. Please try again.', 502);

  const $ = cheerio.load(source);
  $('script, iframe, frame, frameset, object, embed, applet, link, base, meta, audio, video, source, track, portal, noscript, set, animate').remove();
  $('*').filter((_, el) => String(el.name || '').toLowerCase() === 'foreignobject').remove();

  // Any picture the AI drew anyway becomes a placeholder, so nothing points at a file that does not exist.
  $('img').each((_, el) => {
    const src = String($(el).attr('src') || '').trim();
    if (SAFE_IMAGE.test(src)) return;
    const alt = trimLabel($(el).attr('alt'));
    $(el).replaceWith(`<div class="ph ph-photo" role="img" aria-label="${alt.replace(/"/g, '&quot;')}"${alt ? ` data-label="${alt.replace(/"/g, '&quot;')}"` : ''}></div>`);
  });

  $('*').each((_, el) => {
    for (const [name, value] of Object.entries(el.attribs || {})) {
      const key = name.toLowerCase();
      const val = String(value).trim();
      if (key.startsWith('on') || ['srcset', 'action', 'formaction', 'ping', 'poster', 'target', 'integrity', 'background'].includes(key)) $(el).removeAttr(name);
      else if (key === 'href' || key === 'xlink:href') { if (!val.startsWith('#')) $(el).attr(name, '#'); }
      else if (key === 'src') { if (!SAFE_IMAGE.test(val)) $(el).removeAttr(name); }
      else if (key === 'style') $(el).attr(name, cleanCss(val));
    }
  });
  $('style').each((_, el) => { $(el).text(cleanCss($(el).text())); });

  const text = $('body').text().replace(/\s+/g, ' ').trim();
  if (text.length < 150) throw new UserError('The AI returned an incomplete page. Please try again.', 502);

  // Ours goes first so the design's own rules win wherever they overlap.
  $('head').prepend(`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style id="rs-placeholders">${placeholderCss(brand)}</style>`);
  return `<!DOCTYPE html>\n${$.html($('html'))}`;
}
