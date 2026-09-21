import {getApi} from '../index';
import type {BulkCloseQuery, BulkCloseResult} from '../model';
import {ApiError} from '../error';
import {useResource} from './resource';
import {useAction} from './action';
export function useConnections(src?: string, enabled = true) {
  const api = getApi();
  return useResource(
    {key: ['connections', {src}], fetch: signal => api.connections({type: 'all', detail: 'full', limit: 1000, src}, signal)},
    {deps: [api, src], enabled}
  );
}
export function useConnectionClose(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  // Bulk close for a selection the contract can express (network and source IP); anything narrower (a text
  // or outbound filter) closes one by one, where a 409 or 404 is a connection the backend no longer owns.
  const closeAll = (selection: {query: BulkCloseQuery} | {ids: string[]}): Promise<BulkCloseResult> =>
    run('all', async signal => {
      try {
        if ('query' in selection) return await api.closeConnections(selection.query, signal);
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
    }).then(result => result ?? {closed: 0, skipped: 0});
  return {
    busy,
    close: (id: string) =>
      run(id, async signal => {
        await api.closeConnection(id, signal);
        refetch();
      }),
    closeAll
  };
}
