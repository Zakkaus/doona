import {expect, it} from 'vitest';
import {sha256, sha256Bytes} from './hash';

const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

it('the pure fallback matches WebCrypto on empty, short, block-boundary and multi-block texts', async () => {
  for (const text of [
    '',
    'abc',
    'a'.repeat(55),
    'a'.repeat(56),
    'a'.repeat(64),
    'global {\n  tproxy_port: 12345\n}\n'.repeat(40),
    '\u00fcn\u00efcode \u00b7 \u00df \u20ac'
  ]) {
    const bytes = new TextEncoder().encode(text);
    const expected = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    expect(hex(sha256Bytes(bytes))).toBe(expected);
    expect(await sha256(text)).toBe(expected);
  }
  expect(hex(sha256Bytes(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
