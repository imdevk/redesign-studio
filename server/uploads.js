import sharp from 'sharp';
import { UserError } from './errors.js';

// Screenshots the person uploads instead of letting the tool open the page. This is the way in for pages that
// block automated visits or need a login. Images are checked, tidied and cut into readable slices for the AI.

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const SLICE_HEIGHT = 2200;
const MAX_SLICES = 6;
const WIDTH = 1440;
const PHONE_WIDTH_LIMIT = 700;

const kindOf = b => {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
};

/** Turns the browser's list of base64 strings into checked Buffers. */
export function decodeImages(list) {
  if (!Array.isArray(list) || list.length === 0) throw new UserError('Add at least one screenshot.', 400);
  if (list.length > MAX_IMAGES) throw new UserError(`Use at most ${MAX_IMAGES} screenshots.`, 400);
  return list.map((item, index) => {
    const raw = typeof item === 'string' ? item : item?.data;
    if (typeof raw !== 'string' || raw.length < 100) throw new UserError(`Screenshot ${index + 1} is empty.`, 400);
    const buffer = Buffer.from(raw.replace(/^data:[^,]*,/, ''), 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new UserError(`Screenshot ${index + 1} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Save it as a JPG or make it smaller.`, 413);
    if (!kindOf(buffer)) throw new UserError(`Screenshot ${index + 1} must be a PNG, JPG or WebP picture.`, 415);
    return buffer;
  });
}

async function tidy(buffer, index) {
  let image;
  try {
    image = sharp(buffer, { failOn: 'error', limitInputPixels: 120_000_000 }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    if (meta.width < 240 || meta.height < 240) throw new UserError(`Screenshot ${index + 1} is too small to read. Use a bigger one.`, 422);
    const flat = await image.flatten({ background: '#ffffff' }).resize({ width: WIDTH, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { buffer: flat.data, width: flat.info.width, height: flat.info.height };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(`Screenshot ${index + 1} could not be read. Try saving it again as a PNG or JPG.`, 422);
  }
}

async function slice(image, scale) {
  const base = scale === 1 ? image.buffer : (await sharp(image.buffer).resize({ width: Math.round(image.width * scale) }).jpeg({ quality: 82 }).toBuffer());
  const { width, height } = await sharp(base).metadata();
  const out = [];
  for (let top = 0; top < height; top += SLICE_HEIGHT) {
    const h = Math.min(SLICE_HEIGHT, height - top);
    if (h < 120 && out.length) break; // a sliver of footer is not worth an image
    out.push(await sharp(base).extract({ left: 0, top, width, height: h }).jpeg({ quality: 82 }).toBuffer());
  }
  return out;
}

/**
 * buffers -> {
 *   view: { desktop, phone }       pictures for the Original tab,
 *   slices: [Buffer],              what the AI receives, in page order,
 *   count
 * }
 */
export async function prepareUploads(buffers) {
  const images = [];
  for (let i = 0; i < buffers.length; i += 1) images.push(await tidy(buffers[i], i));

  let slices = [];
  for (let scale = 1; scale >= 0.5; scale -= 0.15) {
    slices = (await Promise.all(images.map(image => slice(image, scale)))).flat();
    if (slices.length <= MAX_SLICES) break;
  }
  if (slices.length > MAX_SLICES) slices = slices.slice(0, MAX_SLICES);

  const wide = images.find(i => i.width > PHONE_WIDTH_LIMIT), narrow = images.find(i => i.width <= PHONE_WIDTH_LIMIT);
  const show = async image => (image ? sharp(image.buffer).extract({ left: 0, top: 0, width: image.width, height: Math.min(image.height, 6000) }).jpeg({ quality: 82 }).toBuffer() : null);
  const desktop = await show(wide), phone = await show(narrow);
  return { view: { desktop: desktop || phone, phone: phone || desktop }, slices, count: images.length };
}

/** The page description used in place of a real capture. Nothing is read automatically, so it carries no text. */
export function screenshotSite({ name, files }) {
  const title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Uploaded screenshots';
  return {
    source: 'screenshot', uploadFiles: files, host: title, finalUrl: '', url: '', title, description: '', siteName: name ? title : '', language: 'en',
    fonts: {}, headings: [], paragraphs: [], navigation: [], buttons: [], sections: [], images: [], contact: { emails: [], phones: [] }, socials: [],
    colors: { background: '', text: '', accents: [], surfaces: [] }, textLength: 0, thin: false, suggestedCategory: 'other'
  };
}
