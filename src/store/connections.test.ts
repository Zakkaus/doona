import {expect, it} from 'vitest';
import {ApiError} from '../api/error';
import type {BulkCloseQuery, Connection, ConnectionList} from '../api/model';
import {closeInBatches} from './connections';

type Row = {id: string; network: 'tcp' | 'udp'; src: string | null; owned: boolean};

// A backend that refuses a bulk close selecting more than `limit` live entries, as honk does, and lists at most
// `page` rows.
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
    connections: async (query?: {type?: 'tcp' | 'udp' | 'all'; src?: string; limit?: number}) => {
      const selected = live.filter(matches({type: query?.type, src: query?.src}));
      const shown = selected.slice(0, query?.limit ?? page).slice(0, page);
      const list = (network: 'tcp' | 'udp') => shown.filter(row => row.network === network).map(row => ({id: row.id, src: row.src}) as unknown as Connection);
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
