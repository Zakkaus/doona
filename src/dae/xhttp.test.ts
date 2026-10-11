import {expect, it} from 'vitest';
import {readXhttp, writeXhttp} from './xhttp';

const extra = (value: unknown) => `extra=${encodeURIComponent(JSON.stringify(value))}`;
const base = 'vless://00000000-0000-4000-8000-000000000001@example.com:443';
const decoded = (link: string) => JSON.parse(new URLSearchParams(link.split('?')[1].split('#')[0]).get('extra') ?? '{}');

it.each([
  `${base}?security=tls&type=xhttp&path=%2Fx%252Fy&extra=%7B%22headers%22%3A%7B%22X-Test%22%3A%22a%2Bb%22%7D%7D#edge`,
  `trojan://pw@example.com:443?type=splithttp&alpn=h2,http/1.1&fp=chrome&mode=stream-up#a%20b`,
  `${base}?type=xhttp&${extra({xmux: {maxConcurrency: '1'}, xPaddingBytes: {min: 1, max: 9}})}`,
  `  ${base}?type=xhttp&path=%2Fx#typed with blanks  `
])('writes nothing back when nothing changed: %s', link => {
  expect(writeXhttp(link, readXhttp(link)!)).toBe(link);
});

it('reads query claims over extra and decodes the literal path once', () => {
  const link = `${base}?type=xhttp&path=%2Fx%252Fy&${extra({path: '/ignored/', host: 'cdn.example', xPaddingBytes: {min: 5, max: 9}, noGRPCHeader: true})}`;
  expect(readXhttp(link)).toMatchObject({path: '/x%2Fy', host: 'cdn.example', xPaddingBytes: '5-9', noGRPCHeader: true, mode: ''});
});

it('rewrites only the changed option and keeps unknown extra members', () => {
  const head = `${base}?security=tls&type=xhttp&alpn=h2,http/1.1&sni=a.example`;
  const link = `${head}&${extra({xmux: {maxConcurrency: '1'}, headers: {'X-A': 'a+b'}})}#edge`;
  const next = writeXhttp(link, {...readXhttp(link)!, xPaddingBytes: '200-400', scMinPostsIntervalMs: '10'});
  expect(next.startsWith(`${head}&extra=`)).toBe(true);
  expect(next.endsWith('#edge')).toBe(true);
  expect(decoded(next)).toEqual({xmux: {maxConcurrency: '1'}, headers: {'X-A': 'a+b'}, xPaddingBytes: '200-400', scMinPostsIntervalMs: 10});
  expect(readXhttp(next)!.headers).toEqual([['X-A', 'a+b']]);
});

it('moves an edited request field to the query and drops its stale extra copy', () => {
  const link = `${base}?type=xhttp&${extra({path: '/old/', mode: 'packet-up'})}`;
  const next = writeXhttp(link, {...readXhttp(link)!, path: '/new path/'});
  expect(next).toBe(`${base}?type=xhttp&${extra({mode: 'packet-up'})}&path=%2Fnew%20path%2F`);
  const cleared = writeXhttp(next, {...readXhttp(next)!, mode: '', headers: [['', 'dropped']]});
  expect(cleared).toBe(`${base}?type=xhttp&path=%2Fnew%20path%2F`);
});

it('writes a download peer honk can admit and keeps its other members', () => {
  const link = `${base}?type=xhttp&${extra({downloadSettings: {address: 'old.example', port: 443, network: 'xhttp', security: 'tls', alpn: ['h2'], tlsSettings: {serverName: 'sni.example', fingerprint: 'chrome'}}})}`;
  const download = {address: 'down.example', port: '8443', serverName: '', path: '/down/', host: ''};
  expect(decoded(writeXhttp(link, {...readXhttp(link)!, download})).downloadSettings).toEqual({
    address: 'down.example',
    port: 8443,
    network: 'xhttp',
    security: 'tls',
    alpn: ['h2'],
    tlsSettings: {fingerprint: 'chrome'},
    xhttpSettings: {path: '/down/'}
  });
  expect(decoded(writeXhttp(link, {...readXhttp(link)!, download: null}))).toEqual({});
});

it.each([
  `${base}?type=ws&path=%2F`,
  `vmess://e30=`,
  `${base}?type=xhttp&path=%2Fa&path=%2Fb`,
  `${base}?type=xhttp&extra=%7Bbroken`,
  `${base}?type=xhttp&extra=%5B%5D`,
  `${base}?type=xhttp&path=%E0%A4%A`,
  `${base}?type=xhttp&${extra({headers: {'X-A': {nested: true}}})}`,
  `${base}?type=xhttp&${extra({xPaddingBytes: {min: '1', max: 2}})}`,
  `${base}?type=xhttp&${extra({downloadSettings: {address: 'd.example', port: 443, tlsSettings: 'x'}})}`
])('leaves links it cannot edit field by field alone: %s', link => {
  expect(readXhttp(link)).toBeNull();
  expect(
    writeXhttp(link, {
      mode: 'stream-one',
      path: '',
      host: '',
      headers: [],
      xPaddingBytes: '',
      noGRPCHeader: false,
      scMaxEachPostBytes: '',
      scMinPostsIntervalMs: '',
      download: null
    })
  ).toBe(link);
});

it('writes nothing for header rows that are still waiting for a name', () => {
  const link = `${base}?type=xhttp&extra=%7B%20%22headers%22%3A%20%7B%22X-A%22%3A%20%22a%22%7D%7D`;
  const fields = readXhttp(link)!;
  expect(writeXhttp(link, {...fields, headers: [...fields.headers, ['', 'pending']]})).toBe(link);
});
