import {afterEach, expect, it, vi} from 'vitest';
import {parseGeositeList} from './geoCdn';

// A tiny protobuf encoder building synthetic GeoSiteList buffers, so the CDN
// decoder and the query semantics are tested without the real 11MB file.
const encoder = new TextEncoder();
const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const varintBytes = (value: number): Uint8Array => {
  const bytes: number[] = [];
  let rest = value;
  do {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
  return new Uint8Array(bytes);
};
const lenField = (field: number, payload: Uint8Array): Uint8Array => concat([varintBytes(field * 8 + 2), varintBytes(payload.length), payload]);
const strField = (field: number, text: string): Uint8Array => lenField(field, encoder.encode(text));
const varField = (field: number, value: number): Uint8Array => concat([varintBytes(field * 8), varintBytes(value)]);
// v2ray Domain.Type: 0 Plain, 1 Regex, 2 RootDomain, 3 Full.
const domainEntry = (type: number, value: string, attrs: string[] = []): Uint8Array =>
  concat([varField(1, type), strField(2, value), ...attrs.map(attr => lenField(3, strField(1, attr)))]);
const category = (code: string, domains: Uint8Array[]): Uint8Array => concat([strField(1, code), ...domains.map(domain => lenField(2, domain))]);
const geositeList = (categories: Uint8Array[]): Uint8Array => concat(categories.map(item => lenField(1, item)));

const dat = geositeList([
  category('GOOGLE', [domainEntry(2, 'google.com'), domainEntry(3, 'mail.google.com', ['cn']), domainEntry(0, 'goog'), domainEntry(1, '^ads\\.')]),
  category('GFW', [domainEntry(2, 'example.org'), domainEntry(3, 'blocked.example')])
]);

async function loadModule(fetchImpl: typeof fetch) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  return import('./geoCdn');
}
const okFetch = (body: Uint8Array) => async () => new Response(new Uint8Array(body).buffer, {status: 200, headers: {etag: '"v1"'}});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('decodes categories, entry kinds and attribute keys', () => {
  const categories = parseGeositeList(dat);
  expect(categories.map(item => item.code)).toEqual(['google', 'gfw']);
  expect(categories[0]!.entries).toEqual([
    {type: 'domain', value: 'google.com', attrs: []},
    {type: 'full', value: 'mail.google.com', attrs: ['cn']},
    {type: 'keyword', value: 'goog', attrs: []},
    {type: 'regexp', value: '^ads\\.', attrs: []}
  ]);
});

it('shows a category case-insensitively and truncates at the limit', async () => {
  const {queryGeodataCdn} = await loadModule(okFetch(dat));
  const shown = await queryGeodataCdn({action: 'show', code: 'GOOGLE', limit: 2});
  expect(shown).toMatchObject({action: 'show', code: 'google', total: 4, truncated: true});
  if (shown.action === 'show') expect(shown.entries).toHaveLength(2);
  const filtered = await queryGeodataCdn({action: 'show', code: 'google', attr: 'cn'});
  if (filtered.action === 'show') expect(filtered.entries).toEqual([{type: 'full', value: 'mail.google.com', attrs: ['cn']}]);
});

it('returns the whole category when no limit is given', async () => {
  const {queryGeodataCdn} = await loadModule(okFetch(dat));
  const shown = await queryGeodataCdn({action: 'show', code: 'google'});
  expect(shown).toMatchObject({total: 4, truncated: false});
  if (shown.action === 'show') expect(shown.entries).toHaveLength(4);
});

it('rejects an unknown category with a local error', async () => {
  const {queryGeodataCdn} = await loadModule(okFetch(dat));
  const failure = await queryGeodataCdn({action: 'show', code: 'nope'}).catch((error: unknown) => error);
  // vi.resetModules gives the module its own copy of the error class, so the
  // identity is checked by name rather than instanceof.
  expect(failure).toMatchObject({name: 'LocalError', key: 'dns.geodataUnknownCategory'});
});

it('finds a domain across categories by every entry kind', async () => {
  const {queryGeodataCdn} = await loadModule(okFetch(dat));
  const codes = async (value: string) => {
    const found = await queryGeodataCdn({action: 'find', value});
    return found.action === 'find' ? found.matches.map(match => `${match.code}:${match.type}`) : [];
  };
  expect(await codes('www.google.com')).toContain('google:domain');
  expect(await codes('mail.google.com')).toContain('google:full');
  expect(await codes('sub.example.org')).toContain('gfw:domain');
  expect(await codes('blocked.example')).toContain('gfw:full');
  expect(await codes('mygooglesite.net')).toContain('google:keyword');
  expect(await codes('ads.tracker.net')).toContain('google:regexp');
  expect(await queryGeodataCdn({action: 'find', value: 'nothing.example'})).toMatchObject({total: 0, matches: []});
});

it('downloads once for repeated queries', async () => {
  const fetcher = vi.fn(okFetch(dat));
  const {queryGeodataCdn} = await loadModule(fetcher);
  await queryGeodataCdn({action: 'show', code: 'gfw'});
  await queryGeodataCdn({action: 'find', value: 'example.org'});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('names a network failure, an HTTP failure and a corrupt file separately', async () => {
  const network = await loadModule(async () => {
    throw new TypeError('Failed to fetch');
  });
  const networkFailure = await network.queryGeodataCdn({action: 'show', code: 'gfw'}).catch((error: unknown) => error);
  expect(networkFailure).toMatchObject({name: 'LocalError', key: 'dns.geodataFetchFailed'});

  const http = await loadModule(async () => new Response('nope', {status: 503}));
  const httpFailure = await http.queryGeodataCdn({action: 'show', code: 'gfw'}).catch((error: unknown) => error);
  expect(httpFailure).toMatchObject({text: {key: 'dns.geodataFetchStatus', params: {status: '503'}}});

  const corrupt = await loadModule(okFetch(new Uint8Array([0xff, 0xff, 0xff])));
  const corruptFailure = await corrupt.queryGeodataCdn({action: 'show', code: 'gfw'}).catch((error: unknown) => error);
  expect(corruptFailure).toMatchObject({name: 'LocalError', key: 'dns.geodataParseFailed'});
});
