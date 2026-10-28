import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';
import {createPager} from './common';

afterEach(() => vi.useRealTimers());
it('continues the retained DNS snapshot after deleting its first entry', async () => {
  const api = createMockApi();
  const original = await api.dnsCache();
  const first = await api.dnsCache({limit: 1});
  await api.deleteDnsEntry(first.entries[0].entry_id);
  const rest = [];
  for (let cursor = first.next_cursor; cursor;) {
    const page = await api.dnsCache({cursor, limit: 1});
    expect(page.total).toBe(original.total);
    rest.push(...page.entries);
    cursor = page.next_cursor;
  }
  expect([first.entries[0], ...rest]).toEqual(original.entries);
  expect((await api.dnsCache()).entries.some(entry => entry.entry_id === first.entries[0].entry_id)).toBe(false);
});
type Api = ReturnType<typeof createMockApi>;
type Walk = {next_cursor: string | null};
// Each paginated resource, with a query that changes the filters, and the cursor rules honk gives it.
const resources: {
  name: string;
  list: (api: Api, query: object) => Promise<Walk>;
  size: number;
  filter?: object;
  aligned?: boolean;
  canonical?: 'nodes' | 'dnsLog';
  empty: number;
}[] = [
  {name: 'nodes', size: 2, list: (api, q) => api.nodes(q), filter: {group_id: 'proxy'}, aligned: true, canonical: 'nodes', empty: 410},
  {name: 'providers', size: 1, list: (api, q) => api.providers(q), canonical: 'nodes', empty: 410},
  {name: 'flows', size: 2, list: (api, q) => api.flows(q), filter: {network: 'tcp'}, aligned: true, empty: 400},
  {name: 'dnsCache', size: 2, list: (api, q) => api.dnsCache(q), filter: {include_expired: true}, empty: 410},
  {name: 'dnsLog', size: 2, list: (api, q) => api.dnsLog(q), filter: {name: 'a'}, canonical: 'dnsLog', empty: 410}
];
const cursorCases = resources.flatMap(r => {
  const row = (label: string, status: number, code: string, query: (cursor: string) => object) => [r.name, label, status, code, query] as const;
  const [gone, bad] = [410, 400];
  return [
    row('an unknown snapshot', gone, 'snapshot_expired', c => ({cursor: `00000000-0000-4000-8000-000000000000:${c.split(':')[1]}`, limit: r.size})),
    row('no separator', gone, 'snapshot_expired', () => ({cursor: 'garbage', limit: r.size})),
    row('a non-numeric offset', gone, 'snapshot_expired', c => ({cursor: `${c.split(':')[0]}:x`, limit: r.size})),
    row('offset zero', gone, 'snapshot_expired', c => ({cursor: `${c.split(':')[0]}:0`, limit: r.size})),
    row('an offset past the end', gone, 'snapshot_expired', c => ({cursor: `${c.split(':')[0]}:99999`, limit: r.size})),
    row('an extra segment', r.name === 'dnsLog' ? bad : gone, r.name === 'dnsLog' ? 'invalid_request' : 'snapshot_expired', c => ({
      cursor: `${c}:1`,
      limit: r.size
    })),
    row('an empty cursor', r.empty, r.empty === 400 ? 'invalid_request' : 'snapshot_expired', () => ({cursor: '', limit: r.size})),
    row('another page size', bad, 'invalid_request', c => ({cursor: c, limit: r.size + 1})),
    ...(r.filter ? [row('other filters', bad, 'invalid_request', c => ({cursor: c, limit: r.size, ...r.filter}))] : []),
    ...(r.aligned ? [row('an offset off the page grid', gone, 'snapshot_expired', c => ({cursor: `${c.split(':')[0]}:${r.size + 1}`, limit: r.size}))] : []),
    ...(r.canonical === 'nodes' ? [row('a noncanonical offset', gone, 'snapshot_expired', c => ({cursor: `${c.split(':')[0]}:02`, limit: r.size}))] : []),
    ...(r.canonical === 'dnsLog' ? [row('a noncanonical offset', bad, 'invalid_request', c => ({cursor: `${c.split(':')[0]}:02`, limit: r.size}))] : [])
  ];
});
it.each(cursorCases)('refuses a %s cursor: %s as %i %s', async (name, _label, status, code, query) => {
  const api = createMockApi();
  const resource = resources.find(r => r.name === name)!;
  const cursor = (await resource.list(api, {limit: resource.size})).next_cursor!;
  await expect(resource.list(api, query(cursor))).rejects.toMatchObject({status, code});
});
it.each(resources)('refuses a $name cursor on another adapter, as 410 snapshot_expired', async resource => {
  const cursor = (await resource.list(createMockApi(), {limit: resource.size})).next_cursor!;
  await expect(resource.list(createMockApi(), {cursor, limit: resource.size})).rejects.toMatchObject({status: 410, code: 'snapshot_expired'});
});
it('refuses a cursor from another resource as 410 snapshot_expired', async () => {
  const api = createMockApi();
  const cursor = (await api.nodes({limit: 1})).next_cursor!;
  await expect(api.providers({cursor, limit: 1})).rejects.toMatchObject({status: 410, code: 'snapshot_expired'});
});
it('holds eight snapshots: the oldest goes for nodes, a ninth DNS cache walk is refused with 503', async () => {
  const api = createMockApi();
  const first = (await api.nodes({limit: 1})).next_cursor!;
  for (let i = 0; i < 8; i++) await api.nodes({limit: 1});
  await expect(api.nodes({cursor: first, limit: 1})).rejects.toMatchObject({status: 410, code: 'snapshot_expired'});
  const cache = createMockApi();
  for (let i = 0; i < 8; i++) await cache.dnsCache({limit: 1});
  await expect(cache.dnsCache({limit: 1})).rejects.toMatchObject({status: 503, code: 'snapshot_unavailable'});
});
it('refuses a DNS log cursor whose snapshot was evicted', async () => {
  const api = createMockApi();
  const first = await api.dnsLog({limit: 1});
  // The pager keeps 32 snapshots; each later first page evicts the oldest.
  for (let i = 0; i < 32; i++) await api.dnsLog({limit: 1});
  await expect(api.dnsLog({cursor: first.next_cursor!, limit: 1})).rejects.toMatchObject({status: 410, code: 'snapshot_expired'});
});
it('expires every retained snapshot after 30 seconds as 410 snapshot_expired', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const walks = await Promise.all(resources.map(async resource => [resource, (await resource.list(api, {limit: resource.size})).next_cursor!] as const));
  await vi.advanceTimersByTimeAsync(30000);
  for (const [resource, cursor] of walks)
    await expect(resource.list(api, {cursor, limit: resource.size})).rejects.toMatchObject({status: 410, code: 'snapshot_expired'});
});

it('counts UTF-8 bytes when a DNS log response ends before its row limit', () => {
  const rows = ['1', '2', '3'].map(id => ({id, name: '東京'}));
  const page = createPager('dnsLog', 51);
  const first = page(rows);
  expect(first.items).toEqual(rows.slice(0, 1));
  expect(page(rows, {cursor: first.next_cursor!}).items).toEqual(rows.slice(1, 2));
});
