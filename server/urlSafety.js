import dns from 'node:dns/promises';
import net from 'node:net';
import { UserError } from './errors.js';

// The tool opens whatever address you type in a real browser. By default it refuses addresses that
// point at your own machine or private network, so a pasted link cannot make it read internal pages.
// Set ALLOW_PRIVATE_URLS=true to redesign a site running locally.

const blocked = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96], ['2002::', 16]]) {
  blocked.addSubnet(address, prefix, 'ipv6');
}

function expandIPv6(address) {
  let value = address.toLowerCase().split('%')[0];
  const tail = value.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const p = tail[1].split('.').map(Number);
    value = value.slice(0, -tail[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...Array(Math.max(fill, 0)).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map(g => parseInt(g, 16));
}

export function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return blocked.check(address, 'ipv4');
  if (version === 6) {
    const g = expandIPv6(address);
    if (!g) return true;
    if (g.slice(0, 5).every(n => n === 0) && (g[5] === 0xffff || g[5] === 0)) {
      return blocked.check(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`, 'ipv4') || (g[5] === 0 && g[6] === 0 && g[7] <= 1);
    }
    return blocked.check(address, 'ipv6');
  }
  return true;
}

/** Turns what was typed ("example.com", "https://example.com/menu") into a URL, or explains what is wrong. */
export function normalizeUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 500) throw new UserError('Enter a website address such as example.com.', 400);
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new UserError('That does not look like a valid website address.', 400); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UserError('Only http and https addresses are supported.', 400);
  if (url.username || url.password) throw new UserError('Addresses containing a username or password are not allowed.', 400);
  url.hash = '';
  return url;
}

/** Refuses private and local addresses unless allowPrivate is set. Resolves names the way the browser will. */
export async function assertAllowed(url, { allowPrivate = false, lookup = dns.lookup } = {}) {
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const refusal = new UserError('That address points to your own computer or a private network. Set ALLOW_PRIVATE_URLS=true in .env if you want that.', 400);
  if (net.isIP(host)) { if (isPrivateAddress(host)) throw refusal; return; }
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|localdomain|lan|home)$/.test(host)) throw refusal;
  let addresses;
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new UserError('That website address could not be found. Check the spelling and your internet connection.', 422); }
  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) throw refusal;
}
