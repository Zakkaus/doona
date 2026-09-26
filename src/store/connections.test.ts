import {afterEach, expect, it, vi} from 'vitest';
import type {Api} from '../api/api';
import {ApiError} from '../api/error';
import type {BulkCloseQuery, Connection, ConnectionList} from '../api/model';
import {connections as fixture} from '../api/mock/fixtures';
import {closeInBatches, connectionsResource, withRates} from './connections';
import {watchResource} from './resourceCore';

type Row = {id: string; network: 'tcp' | 'udp'; src: string | null; owned: boolean};

// A backend that refuses a bulk close selecting more than `limit` live entries, as honk does, and lists at most
// `page` rows; like honk, only the full detail tier carries `src`.
function backend(rows: Row[], limit: number, page = 1000) {
  const live = [...rows];
  const calls: string[] = [];
  const matches = (query: NonNullable<BulkCloseQuery>) => (row: Row) =>
    (!query.type || query.type === 'all' || row.network === query.type) && (!query.src || row.src?.split(':')[0] === query.src);
  const api = {
    closeConnections: async (query: BulkCloseQuery) => {
      calls.push(`bulk ${query?.type ?? 'all'} ${query?.src ?? '*'}`);
      const selected = live.filter(matches(query!));
      if (selected.length > limit) throw new ApiError(413, 'request_too_large', 'Too many matching connections');
      for (const row of selected.filter(row => row.owned)) live.splice(live.indexOf(row), 1);
      return {closed: selected.filter(row => row.owned).length, skipped: selected.filter(row => !row.owned).length};
    },
    closeConnection: async (id: string) => {
      calls.push(`one ${id}`);
      const row = live.find(item => item.id === id);
      if (!row) throw new ApiError(404, 'resource_not_found', 'Connection not found');
      if (!row.owned) throw new ApiError(409, 'state_conflict', 'Not closable');
      live.splice(live.indexOf(row), 1);
    },
    connections: async (query?: {type?: 'tcp' | 'udp' | 'all'; src?: string; limit?: number; detail?: 'summary' | 'full'}) => {
      const selected = live.filter(matches({type: query?.type, src: query?.src}));
      const shown = selected.slice(0, query?.limit ?? page).slice(0, page);
      const list = (network: 'tcp' | 'udp') =>
        shown.filter(row => row.network === network).map(row => ({id: row.id, ...(query?.detail === 'full' ? {src: row.src} : {})}) as unknown as Connection);
      const total = (network: 'tcp' | 'udp') => selected.filter(row => row.network === network).length;
      return {
        tcp: list('tcp'),
        udp: list('udp'),
        total_tcp: total('tcp'),
        total_udp: total('udp'),
        truncated: shown.length < selected.length
      } as unknown as ConnectionList;
    }
  };
  return {api, live, calls};
}

const rows = (network: 'tcp' | 'udp', src: string | null, n: number, owned = true): Row[] =>
  Array.from({length: n}, (_, i) => ({id: `${network}-${src}-${i}`, network, src: src && src + ':' + (1000 + i), owned}));

it('closes in one request when the selection fits the limit', async () => {
  const {api, live, calls} = backend([...rows('tcp', '10.0.0.1', 2), ...rows('udp', '10.0.0.2', 1)], 5);
  expect(await closeInBatches(api, {all: true})).toEqual({closed: 3, skipped: 0});
  expect(live).toEqual([]);
  expect(calls).toEqual(['bulk all *']);
});

it('splits an unfiltered close by network and then by source until each request fits', async () => {
  const {api, live, calls} = backend([...rows('tcp', '10.0.0.1', 3), ...rows('tcp', '10.0.0.2', 3), ...rows('udp', '10.0.0.3', 2, false)], 4);
  expect(await closeInBatches(api, {all: true})).toEqual({closed: 6, skipped: 2});
  expect(live.map(row => row.id)).toEqual(rows('udp', '10.0.0.3', 2).map(row => row.id));
  expect(calls).toEqual(['bulk all *', 'bulk tcp *', 'bulk tcp 10.0.0.1', 'bulk tcp 10.0.0.2', 'bulk tcp *', 'bulk udp *']);
});

it('closes one source over the limit one by one, then picks up what the listing left out', async () => {
  const {api, live} = backend(rows('tcp', '10.0.0.1', 7), 2, 3);
  expect(await closeInBatches(api, {type: 'tcp', src: '10.0.0.1'})).toEqual({closed: 7, skipped: 0});
  expect(live).toEqual([]);
});

it('counts a connection it could not close once, though every round meets it again', async () => {
  const {api, live} = backend([...rows('tcp', '10.0.0.1', 3), ...rows('tcp', '10.0.0.1', 1, false).map(row => ({...row, id: 'kernel'}))], 2);
  expect(await closeInBatches(api, {type: 'tcp', src: '10.0.0.1'})).toEqual({closed: 3, skipped: 1});
  expect(live.map(row => row.id)).toEqual(['kernel']);
});

it('closes connections without a visible source one by one', async () => {
  const {api, live} = backend([...rows('tcp', null, 3), ...rows('tcp', '10.0.0.1', 1)], 2);
  expect(await closeInBatches(api, {type: 'tcp'})).toEqual({closed: 4, skipped: 0});
  expect(live).toEqual([]);
});

it('stops when a round closes nothing instead of retrying forever', async () => {
  const {api, live} = backend(rows('tcp', '10.0.0.1', 5, false), 2);
  expect(await closeInBatches(api, {type: 'tcp', src: '10.0.0.1'})).toEqual({closed: 0, skipped: 5});
  expect(live).toHaveLength(5);
});

it('counts what the listing never reached as left open when a round closes nothing', async () => {
  // The listing shows only the first rows, all kernel-direct; the closable ones behind them cannot be reached.
  const {api, live} = backend([...rows('tcp', '10.0.0.1', 3, false), ...rows('tcp', '10.0.0.2', 2)], 2, 3);
  expect(await closeInBatches(api, {type: 'tcp'})).toEqual({closed: 0, skipped: 5});
  expect(live).toHaveLength(5);
});

it('passes on failures other than the limit', async () => {
  const {api} = backend(rows('tcp', '10.0.0.1', 1), 5);
  const refused = new ApiError(403, 'permission_denied', 'Forbidden');
  api.closeConnections = async () => {
    throw refused;
  };
  await expect(closeInBatches(api, {all: true})).rejects.toBe(refused);
});

// Two snapshots of one engine, `ms` apart, each carrying one connection per [id, download bytes] pair and no rates.
const snapshot = (ms: number, rows: Array<[string, string | null]>, instance = 'engine-a'): ConnectionList => ({
  ...fixture,
  instance_id: instance,
  observed_at: new Date(Date.UTC(2026, 0, 1) + ms).toISOString(),
  tcp: rows.map(([id, bytes]) => ({
    ...fixture.tcp[0],
    id,
    upload_bytes: '0',
    download_bytes: bytes,
    upload_bytes_per_second: null,
    download_bytes_per_second: null
  })),
  udp: []
});
const down = (list: ConnectionList) => Object.fromEntries(list.tcp.map(c => [c.id, c.download_bytes_per_second]));

it('derives each rate from the bytes between two snapshots, rounding down', () => {
  const first = withRates(undefined, snapshot(0, [['a', '1000']]));
  expect(down(first.list)).toEqual({a: null});
  const next = withRates(
    first.baseline,
    snapshot(3000, [
      ['a', '11000'],
      ['b', '500']
    ])
  );
  expect(down(next.list)).toEqual({a: '3333', b: null});
  expect(next.list.tcp[0].upload_bytes_per_second).toBe('0');
  expect(next.baseline).toBe(next.list);
});

it('keeps a rate the backend reports', () => {
  const later = snapshot(5000, [['a', '9000']]);
  later.tcp[0] = {...later.tcp[0], download_bytes_per_second: '42'};
  expect(down(withRates(snapshot(0, [['a', '1000']]), later).list)).toEqual({a: '42'});
});

it('derives no rate across an engine restart, a counter that went down or unknown bytes', () => {
  const prev = snapshot(0, [
    ['a', '1000'],
    ['b', '1000'],
    ['c', null]
  ]);
  const restarted = withRates(prev, snapshot(5000, [['a', '2000']], 'engine-b'));
  expect(down(restarted.list)).toEqual({a: null});
  expect(restarted.baseline.instance_id).toBe('engine-b');
  const next = snapshot(5000, [
    ['a', '6000'],
    ['b', '10'],
    ['c', '10']
  ]);
  expect(down(withRates(prev, next).list)).toEqual({a: '1000', b: null, c: null});
});

it('keeps the baseline and the last rates over a window under a second', () => {
  const measured = withRates(snapshot(0, [['a', '0']]), snapshot(2000, [['a', '4000']]));
  const early = withRates(
    measured.baseline,
    snapshot(2400, [
      ['a', '4800'],
      ['b', '1']
    ])
  );
  expect(down(early.list)).toEqual({a: '2000', b: null});
  expect(early.baseline).toBe(measured.baseline);
  // A response older than the baseline is a short window too.
  expect(withRates(measured.baseline, snapshot(1000, [['a', '100']])).baseline).toBe(measured.baseline);
  expect(
    down(
      withRates(
        early.baseline,
        snapshot(4000, [
          ['a', '10000'],
          ['b', '1']
        ])
      ).list
    )
  ).toEqual({a: '3000', b: null});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// A connections list read through the resource store; each read watches the list, lets its fetch finish and leaves.
function watchedLists() {
  vi.useFakeTimers();
  vi.stubGlobal('document', Object.assign(new EventTarget(), {hidden: false}));
  const clock = {ms: 0};
  const api = {connections: async () => snapshot(clock.ms, [['a', String(clock.ms)]])} as unknown as Api;
  const read = async (src: string) => {
    const watched = watchResource(api, connectionsResource(api, src, 0), () => {});
    await vi.advanceTimersByTimeAsync(0);
    const data = watched.getSnapshot().data!;
    watched.dispose();
    return down(data);
  };
  return {clock, read};
}

it('drops the baseline of a list the store no longer holds', async () => {
  const {clock, read} = watchedLists();
  await read('10.0.0.1');
  clock.ms = 5000;
  // Still held for a minute after its page closed, so the list measures its next rate from it.
  expect(await read('10.0.0.1')).toEqual({a: '1000'});
  await vi.advanceTimersByTimeAsync(60000);
  clock.ms = 70000;
  await read('10.0.0.2');
  clock.ms = 75000;
  expect(await read('10.0.0.1')).toEqual({a: null});
});

it('measures no rate for a list reopened after it expired', async () => {
  const {clock, read} = watchedLists();
  await read('10.0.0.1');
  await vi.advanceTimersByTimeAsync(60000);
  clock.ms = 70000;
  expect(await read('10.0.0.1')).toEqual({a: null});
});
