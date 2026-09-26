import {useCallback} from 'react';
import {MAX_PAGE} from './cadence';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {BulkCloseQuery, BulkCloseResult, Connection, ConnectionList} from '../api/model';
import {normalizeResourceKey, type ResourceKey} from '../api/inflight';
import {parseU64} from '../api/u64';
import {ApiError} from '../api/error';
import {sourceIp} from '../api/selectors';
import {useResource} from './resource';
import {useAction} from './action';
// The snapshot each connection list measures its next rates against, by resource key.
const baselines = new Map<string, ConnectionList>();
export function useConnections(src?: string, enabled = true, paused = false, every?: number) {
  const api = getApi();
  const key: ResourceKey = ['connections', {src}];
  const name = normalizeResourceKey(key);
  return useResource(
    {
      key,
      every,
      fetch: async signal => {
        const {list, baseline} = withRates(baselines.get(name), await api.connections({type: 'all', detail: 'full', limit: MAX_PAGE, src}, signal));
        baselines.set(name, baseline);
        return list;
      }
    },
    {enabled, paused}
  );
}
const RATE_WINDOW_MS = 1000;
const rateFields = ['upload', 'download'] as const;
// Fills the rates a backend leaves null from the byte counters of two snapshots of the same engine instance:
// floor(Δbytes·1000/Δms) over the snapshots' observed_at. A connection new since `prev`, or whose counter went
// down, has no rate. A snapshot less than a second after `prev`, such as a refetch an event triggered, keeps `prev`
// as the baseline and repeats its rates rather than dividing by a short window.
export function withRates(prev: ConnectionList | undefined, next: ConnectionList): {list: ConnectionList; baseline: ConnectionList} {
  const base = prev?.instance_id === next.instance_id ? prev : undefined;
  const span = base ? Date.parse(next.observed_at) - Date.parse(base.observed_at) : NaN;
  const short = span < RATE_WINDOW_MS;
  const before = new Map(base && Number.isFinite(span) ? [...base.tcp, ...base.udp].map(c => [c.id, c]) : []);
  const rate = (c: Connection) => {
    const old = before.get(c.id);
    let out = c;
    for (const field of rateFields) {
      const key = `${field}_bytes_per_second` as const;
      if (c[key] !== null) continue;
      let value: string | null = null;
      if (old && short) value = old[key];
      else if (old) {
        const from = parseU64(old[`${field}_bytes`]),
          to = parseU64(c[`${field}_bytes`]);
        if (from !== null && to !== null && to >= from) value = String(((to - from) * 1000n) / BigInt(span));
      }
      if (value !== null) out = {...out, [key]: value};
    }
    return out;
  };
  const list = {...next, tcp: next.tcp.map(rate), udp: next.udp.map(rate)};
  return {list, baseline: base && short ? base : list};
}
type CloseApi = Pick<Api, 'closeConnections' | 'closeConnection' | 'connections'>;
const tooLarge = (error: unknown) => error instanceof ApiError && error.status === 413;
const add = (tally: BulkCloseResult, more: BulkCloseResult) => {
  tally.closed += more.closed;
  tally.skipped += more.skipped;
};

// A 409 or 404 is a connection the backend does not own or no longer has.
async function closeEach(api: CloseApi, ids: string[], signal?: AbortSignal): Promise<BulkCloseResult> {
  const tally = {closed: 0, skipped: 0};
  for (const id of ids) {
    try {
      await api.closeConnection(id, signal);
      tally.closed += 1;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) tally.skipped += 1;
      else throw error;
    }
  }
  return tally;
}

// Over the advertised bulk limit the backend closes nothing (413), so the selection is narrowed to what the contract
// can express: each network, then each source address the listing shows. A source still over the limit, and entries
// without a visible source, close one by one. The listing stops at 1000 rows, so each round retries the whole
// selection until it fits, and stops once a round closes nothing. Entries that cannot be closed stay and every round
// meets them again, so skipped is the last round's count while closed adds up; a round that stops counts every entry
// the listing totals, including those past its last row, since none of them was closed.
export async function closeInBatches(api: CloseApi, query: NonNullable<BulkCloseQuery>, signal?: AbortSignal): Promise<BulkCloseResult> {
  const type = query.type ?? 'all';
  let closed = 0;
  for (;;) {
    const round = {closed: 0, skipped: 0};
    try {
      add(round, await api.closeConnections(query, signal));
      return {closed: closed + round.closed, skipped: round.skipped};
    } catch (error) {
      if (!tooLarge(error)) throw error;
    }
    if (type === 'all') {
      for (const network of ['tcp', 'udp'] as const) add(round, await closeInBatches(api, {...query, type: network}, signal));
      return {closed: closed + round.closed, skipped: round.skipped};
    }
    // Only the full detail tier carries `src`.
    const listing = await api.connections({type, src: query.src, detail: 'full', limit: MAX_PAGE}, signal);
    const listed = listing[type];
    const sources = new Map<string | undefined, string[]>();
    for (const row of listed) {
      const src = query.src ?? sourceIp(row.src ?? undefined);
      sources.set(src, (sources.get(src) ?? []).concat(row.id));
    }
    for (const [src, ids] of sources) add(round, src && !query.src ? await closeInBatches(api, {type, src}, signal) : await closeEach(api, ids, signal));
    closed += round.closed;
    if (!round.closed) return {closed, skipped: type === 'tcp' ? listing.total_tcp : listing.total_udp};
  }
}

// Totals count every matching entry before the limit, so one returned entry is enough to read them.
export function useConnectionTotals(enabled = true) {
  const api = getApi();
  return useResource({key: ['connections', {totals: true}], fetch: signal => api.connections({type: 'all', detail: 'summary', limit: 1}, signal)}, {enabled});
}
export function useConnectionClose(refetch: () => void) {
  const api = getApi();
  const {busy, run, cancel} = useAction<string>({rethrow: true});
  // Bulk close for a selection the contract can express (network and source IP); anything narrower (a text
  // or outbound filter) closes one by one. Over the advertised bulk limit, listed ids keep the confirmed scope; a
  // selection without them (close everything) goes in batches the limit admits.
  const closeAll = useCallback(
    (selection: {ids: string[]; query?: BulkCloseQuery}): Promise<BulkCloseResult | undefined> =>
      run('all', async signal => {
        try {
          if (selection.query && !selection.ids.length) return await closeInBatches(api, selection.query, signal);
          if (selection.query)
            try {
              return await api.closeConnections(selection.query, signal);
            } catch (error) {
              if (!tooLarge(error)) throw error;
            }
          return await closeEach(api, selection.ids, signal);
        } finally {
          refetch();
        }
      }),
    [api, run, refetch]
  );
  return {
    busy,
    cancel,
    close: useCallback(
      (id: string) =>
        run(id, async signal => {
          await api.closeConnection(id, signal);
          refetch();
          return true;
        }),
      [api, run, refetch]
    ),
    closeAll
  };
}
