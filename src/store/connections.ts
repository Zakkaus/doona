import {useCallback} from 'react';
import {getApi} from '../api/index';
import type {BulkCloseQuery, BulkCloseResult} from '../api/model';
import {ApiError} from '../api/error';
import {useResource} from './resource';
import {useAction} from './action';
export function useConnections(src?: string, enabled = true) {
  const api = getApi();
  return useResource({key: ['connections', {src}], fetch: signal => api.connections({type: 'all', detail: 'full', limit: 1000, src}, signal)}, {enabled});
}
export function useConnectionClose(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  // Bulk close for a selection the contract can express (network and source IP); anything narrower (a text
  // or outbound filter) closes one by one, where a 409 or 404 is a connection the backend no longer owns.
  const closeAll = useCallback(
    (selection: {ids: string[]; query?: BulkCloseQuery}): Promise<BulkCloseResult | undefined> =>
      run('all', async signal => {
        try {
          if (selection.query)
            try {
              return await api.closeConnections(selection.query, signal);
            } catch (error) {
              // Over the advertised bulk limit the backend closes nothing; the listed ids still get closed one by one.
              if (!(error instanceof ApiError && error.status === 413)) throw error;
            }
          const tally = {closed: 0, skipped: 0};
          for (const id of selection.ids) {
            try {
              await api.closeConnection(id, signal);
              tally.closed += 1;
            } catch (error) {
              if (error instanceof ApiError && (error.status === 409 || error.status === 404)) tally.skipped += 1;
              else throw error;
            }
          }
          return tally;
        } finally {
          refetch();
        }
      }),
    [api, run, refetch]
  );
  return {
    busy,
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
