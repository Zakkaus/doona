import {useCallback} from 'react';
import {MAX_PAGE, poll} from './cadence';
import {ApiError, LocalError} from '../api/error';
import {getApi} from '../api/index';
import type {Node, NodeCreate, OperationAccepted, ProviderCreate, ProviderList} from '../api/model';
import {gated, pageSize, useResource, walk} from './resource';
import {activationError, finished, settle, latencyProbe, useAction, type SucceededResult} from './action';
import {optionsProbe, probeChoices, type ProbeOptions} from './probeOptions';
import {useCapabilities} from './runtime';
export function useNodes(enabled = true) {
  const api = getApi();
  return useResource(
    {
      key: ['nodes'],
      every: poll.inventory,
      fetch: signal =>
        walk(
          cursor => api.nodes({cursor, limit: MAX_PAGE}, signal),
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
  const {data: capabilities, error: capabilitiesError} = useCapabilities();
  const limit = pageSize(capabilities, capabilities?.resources.providers.max_page_size);
  return useResource(
    {
      key: ['providers', {limit}],
      every: poll.inventory,
      fetch: signal =>
        walk(
          cursor => api.providers({cursor, limit}, signal),
          (acc: ProviderList | undefined, page) => {
            if (!acc) return {...page, providers: [...page.providers]};
            acc.providers.push(...page.providers);
            return acc;
          }
        )
    },
    gated(capabilities, capabilitiesError, enabled)
  );
}
export function useProviderRefresh(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<string>({rethrow: true});
  const one = useCallback(
    async (id: string, signal: AbortSignal) => {
      const accepted = await api.refreshProvider(id, signal);
      const result = await settle(api, accepted, signal);
      refetch();
      return finished(result, 'provider_refresh');
    },
    [api, refetch]
  );
  const refresh = useCallback((id: string) => run(id, signal => one(id, signal)), [run, one]);
  // One batch under one signal; the result lists the refreshes that finished before an abort.
  const refreshMany = useCallback(
    (ids: string[], onFailure: (id: string, error: unknown) => void, onDegraded: (id: string) => void) =>
      run('*', async signal => {
        let done = 0;
        for (const id of ids) {
          if (signal.aborted) break;
          try {
            if ('degraded' in (await one(id, signal))) onDegraded(id);
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
type WriteKind = 'node_create' | 'node_delete' | 'provider_create' | 'provider_delete';
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
  // A 409 state_conflict stored nothing, so the list is read again and a retry starts from what is there. It is the
  // configuration changing while the write was admitted, but also a create's name already in use or a node that groups
  // still name as their final (`details.groups`); only a delete without groups is known to be the change, and the
  // others keep the backend's own message.
  const conflict = useCallback(
    (error: unknown, deleting: boolean): never => {
      if (!(error instanceof ApiError && error.status === 409 && error.code === 'state_conflict')) throw activationError(error) ?? error;
      refetch();
      if (deleting && !(error.details as {groups?: unknown} | null)?.groups) throw new LocalError('config.changedMeanwhile');
      throw error;
    },
    [refetch]
  );
  // A 202 hands the write to an operation; the caller stays busy until it settles and gets the operation's result.
  const write = useCallback(
    async <K extends WriteKind>(kind: K, answer: Promise<SucceededResult<K> | OperationAccepted>, signal: AbortSignal): Promise<SucceededResult<K>> => {
      const result = await answer.catch(error => conflict(error, kind.endsWith('_delete')));
      const value = 'operation_id' in result ? (finished(await settle(api, result, signal), kind) as SucceededResult<K>) : result;
      return then(value);
    },
    [api, then, conflict]
  );
  return {
    busy,
    addProvider: useCallback(
      (request: ProviderCreate) => run('provider', signal => write('provider_create', api.createProvider(request, signal), signal)),
      [api, run, write]
    ),
    removeProvider: useCallback((id: string) => run(id, signal => write('provider_delete', api.deleteProvider(id, signal), signal)), [api, run, write]),
    addNode: useCallback((request: NodeCreate) => run('node', signal => write('node_create', api.createNode(request, signal), signal)), [api, run, write]),
    removeNode: useCallback((id: string) => run(id, signal => write('node_delete', api.deleteNode(id, signal), signal)), [api, run, write])
  };
}
export function useNodeProbe(refetch: () => void) {
  const api = getApi();
  const capabilities = useCapabilities();
  const {busy, run} = useAction<string>({rethrow: true});
  const canProbe = latencyProbe(capabilities.data, {type: 'node', node_id: '-'}) !== null;
  const probe = useCallback(
    (nodeId: string, options?: ProbeOptions) => {
      const target = {type: 'node' as const, node_id: nodeId};
      const request = options ? optionsProbe(capabilities.data, target, options) : latencyProbe(capabilities.data, target);
      if (!request) return Promise.resolve(undefined);
      return run(nodeId, async signal => {
        const accepted = await api.startProbe(request, signal);
        const result = await settle(api, accepted, signal);
        refetch();
        return finished(result, 'probe');
      });
    },
    [api, capabilities.data, run, refetch]
  );
  return {busy, canProbe, probe, choices: probeChoices(capabilities.data, 'node')};
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
        const result = await settle(api, accepted, signal);
        refetch();
        return finished(result, 'geodata_update');
      }),
    [api, run, refetch]
  );
  return {...resource, busy: busy !== null, update};
}
