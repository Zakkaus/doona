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
      fetch: signal =>
        walk(
          cursor => api.nodes({cursor, limit: 1000}, signal),
          (acc: Node[] | undefined, page) => [...(acc ?? []), ...page.nodes]
        )
    },
    {deps: [api], every: 30000, enabled}
  );
}
export function useProviders(enabled = true) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const limit = pageSize(capabilities, capabilities?.resources.providers.max_page_size);
  return useResource(
    {
      key: ['providers'],
      fetch: signal =>
        walk(
          cursor => api.providers({cursor, limit}, signal),
          (acc: ProviderList | undefined, page) => (acc ? {...acc, providers: [...acc.providers, ...page.providers]} : page)
        )
    },
    {deps: [api, limit], enabled}
  );
}
export function useProviderRefresh(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  const one = async (id: string, signal: AbortSignal) => {
    const accepted = await api.refreshProvider(id, signal);
    const result = await api.pollOperation(accepted, signal);
    refetch();
    return finished(result, 'provider_refresh');
  };
  const refresh = (id: string) => run(id, signal => one(id, signal));
  // One batch under one signal; the result lists the refreshes that finished before an abort.
  const refreshMany = (ids: string[], onFailure: (id: string, error: unknown) => void) =>
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
    });
  return {busy, refresh, refreshMany};
}
// Managed node/provider writes create a generation; refetch covers backends without generation events.
export function useNodeManage(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  const then = <T>(result: T) => {
    refetch();
    return result;
  };
  return {
    busy,
    addProvider: (request: ProviderCreate) => run('provider', signal => api.createProvider(request, signal).then(then)),
    removeProvider: (id: string) => run(id, signal => api.deleteProvider(id, signal).then(then)),
    addNode: (request: NodeCreate) => run('node', signal => api.createNode(request, signal).then(then)),
    removeNode: (id: string) => run(id, signal => api.deleteNode(id, signal).then(then))
  };
}
export function useNodeProbe(refetch: () => void) {
  const api = getApi();
  const capabilities = useCapabilities();
  const {busy, run} = useAction<string>({rethrow: true});
  const canProbe = tcpProbe(capabilities.data, {type: 'node', node_id: '-'}) !== null;
  const probe = (nodeId: string) => {
    const request = tcpProbe(capabilities.data, {type: 'node', node_id: nodeId});
    if (!request) return Promise.resolve(undefined);
    return run(nodeId, async signal => {
      const accepted = await api.startProbe(request, signal);
      const result = await api.pollOperation(accepted, signal);
      refetch();
      return finished(result, 'probe');
    });
  };
  return {busy, canProbe, probe};
}
export function useGeodata(enabled = true) {
  const api = getApi();
  const resource = useResource({key: ['geodata'], fetch: signal => api.geodata(signal)}, {deps: [api], enabled, every: 0});
  const {busy, run} = useAction<'update'>({rethrow: true});
  const update = () =>
    run('update', async signal => {
      const accepted = await api.updateGeodata(signal);
      const result = await api.pollOperation(accepted, signal);
      resource.refetch();
      return finished(result, 'geodata_update');
    });
  return {...resource, busy: busy !== null, update};
}
