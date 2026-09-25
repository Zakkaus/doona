import {useCallback} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {BulkCloseQuery, BulkCloseResult} from '../api/model';
import {ApiError} from '../api/error';
import {sourceIp} from '../api/selectors';
import {useResource} from './resource';
import {useAction} from './action';
export function useConnections(src?: string, enabled = true, paused = false, every?: number) {
  const api = getApi();
  return useResource(
    {
      key: ['connections', {src}],
      every,
      fetch: signal => api.connections({type: 'all', detail: 'full', limit: listLimit, src}, signal)
    },
    {enabled, paused}
  );
}
// Totals count every matching entry before the limit, so one returned entry is enough to read them.
const listLimit = 1000;
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
// selection until it fits, and stops early once a round closes nothing. Entries that cannot be closed stay and every
// round meets them again, so skipped is the last round's count while closed adds up.
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
    const listed = (await api.connections({type, src: query.src, detail: 'summary', limit: listLimit}, signal))[type];
    const sources = new Map<string | undefined, string[]>();
    for (const row of listed) {
      const src = query.src ?? sourceIp(row.src ?? undefined);
      sources.set(src, (sources.get(src) ?? []).concat(row.id));
    }
    for (const [src, ids] of sources) add(round, src && !query.src ? await closeInBatches(api, {type, src}, signal) : await closeEach(api, ids, signal));
    closed += round.closed;
    if (!round.closed) return {closed, skipped: round.skipped};
  }
}

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
