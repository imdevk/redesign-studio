import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowed, isPrivateAddress, normalizeUrl } from '../urlSafety.js';
import { UserError } from '../errors.js';

test('private, local and reserved addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'garbage']) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
  }
});

test('typed addresses are tidied up or explained', () => {
  assert.equal(normalizeUrl('example.com').href, 'https://example.com/');
  assert.equal(normalizeUrl('  Example.com/menu?x=1#top ').href, 'https://example.com/menu?x=1');
  assert.equal(normalizeUrl('http://example.com:8080/a').port, '8080');
  for (const bad of ['', '   ', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@example.com', 'a'.repeat(600), null, undefined]) {
    assert.throws(() => normalizeUrl(bad), UserError, `${bad} should be rejected`);
  }
});

test('private addresses are refused unless explicitly allowed', async () => {
  const lookup = async host => ({ 'good.example.com': [{ address: '93.184.216.34', family: 4 }], 'evil.example.com': [{ address: '10.0.0.5', family: 4 }], 'mixed.example.com': [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] })[host] || (() => { throw new Error('ENOTFOUND'); })();
  const check = (u, opts = {}) => assertAllowed(normalizeUrl(u), { lookup, ...opts });
  await check('https://good.example.com');
  for (const bad of ['http://127.0.0.1', 'http://localhost:3000', 'http://[::1]/', 'http://169.254.169.254/latest', 'http://10.0.0.1', 'https://evil.example.com', 'https://mixed.example.com', 'http://intranet', 'http://printer.local']) {
    await assert.rejects(check(bad), /own computer or a private network/, bad);
  }
  await assert.rejects(check('https://nowhere.example.com'), /could not be found/);
  await check('http://127.0.0.1:3000', { allowPrivate: true });
  await check('http://localhost:3000', { allowPrivate: true });
});
