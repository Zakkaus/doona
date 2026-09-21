import {useCallback} from 'react';
import {getApi} from '../index';
import type {Node, NodeCreate, ProviderCreate, ProviderList} from '../model';
import {pageSize, useResource, walk} from './resource';
import {finished, tcpProbe, useAction} from './action';
import {useCapabilities} from './runtime';
export function useNodes(enabled = true) {
  const api = getApi();
  return useResource(
    {
      key: ['nodes'],
      every: 30000,
      fetch: signal =>
        walk(
          cursor => api.nodes({cursor, limit: 1000}, signal),
          (acc: Node[] | undefined, page) => {
            if (!acc) return [...page.nodes];
            acc.push(...page.nodes);
            return acc;
          }
        )
    },
    {enabled}
  );
}
export function useProviders(enabled = true) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const limit = pageSize(capabilities, capabilities?.resources.providers.max_page_size);
  return useResource(
    {
      key: ['providers', {limit}],
      fetch: signal =>
        walk(
          cursor => api.providers({cursor, limit}, signal),
          (acc: ProviderList | undefined, page) => (acc ? {...acc, providers: [...acc.providers, ...page.providers]} : page)
        )
    },
    {enabled}
  );
}
export function useProviderRefresh(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  const one = useCallback(
    async (id: string, signal: AbortSignal) => {
      const accepted = await api.refreshProvider(id, signal);
      const result = await api.pollOperation(accepted, signal);
      refetch();
      return finished(result, 'provider_refresh');
    },
    [api, refetch]
  );
  const refresh = useCallback((id: string) => run(id, signal => one(id, signal)), [run, one]);
  // One batch under one signal; the result lists the refreshes that finished before an abort.
  const refreshMany = useCallback(
    (ids: string[], onFailure: (id: string, error: unknown) => void) =>
      run('*', async signal => {
        let done = 0;
        for (const id of ids) {
          if (signal.aborted) break;
          try {
            await one(id, signal);
            done += 1;
          } catch (error) {
            if (signal.aborted) break;
            onFailure(id, error);
          }
        }
        return done;
      }),
    [run, one]
  );
  return {busy, refresh, refreshMany};
}
// Managed node/provider writes create a generation; refetch covers backends without generation events.
export function useNodeManage(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  const then = useCallback(
    <T>(result: T) => {
      refetch();
      return result;
    },
    [refetch]
  );
  return {
    busy,
    addProvider: useCallback((request: ProviderCreate) => run('provider', signal => api.createProvider(request, signal).then(then)), [api, run, then]),
    removeProvider: useCallback((id: string) => run(id, signal => api.deleteProvider(id, signal).then(then)), [api, run, then]),
    addNode: useCallback((request: NodeCreate) => run('node', signal => api.createNode(request, signal).then(then)), [api, run, then]),
    removeNode: useCallback((id: string) => run(id, signal => api.deleteNode(id, signal).then(then)), [api, run, then])
  };
}
export function useNodeProbe(refetch: () => void) {
  const api = getApi();
  const capabilities = useCapabilities();
  const {busy, run} = useAction<string>({rethrow: true});
  const canProbe = tcpProbe(capabilities.data, {type: 'node', node_id: '-'}) !== null;
  const probe = useCallback(
    (nodeId: string) => {
      const request = tcpProbe(capabilities.data, {type: 'node', node_id: nodeId});
      if (!request) return Promise.resolve(undefined);
      return run(nodeId, async signal => {
        const accepted = await api.startProbe(request, signal);
        const result = await api.pollOperation(accepted, signal);
        refetch();
        return finished(result, 'probe');
      });
    },
    [api, capabilities.data, run, refetch]
  );
  return {busy, canProbe, probe};
}
export function useGeodata(enabled = true) {
  const api = getApi();
  const resource = useResource({key: ['geodata'], every: 0, fetch: signal => api.geodata(signal)}, {enabled});
  const {refetch} = resource;
  const {busy, run} = useAction<'update'>({rethrow: true});
  const update = useCallback(
    () =>
      run('update', async signal => {
        const accepted = await api.updateGeodata(signal);
        const result = await api.pollOperation(accepted, signal);
        refetch();
        return finished(result, 'geodata_update');
      }),
    [api, run, refetch]
  );
  return {...resource, busy: busy !== null, update};
}
