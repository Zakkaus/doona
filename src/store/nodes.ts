import {useCallback, useState} from 'react';
import {MAX_PAGE, poll} from './cadence';
import {ApiError, LocalError} from '../api/error';
import {getApi} from '../api/index';
import type {HealthObservation, Node, NodeCreate, OperationAccepted, ProviderCreate, ProviderList} from '../api/model';
import {gated, pageSize, useResource, walk} from './resource';
import {activationError, finished, settle, useAction, type SucceededResult} from './action';
import {optionsProbe, probeChoices, probeFallback, useProbeOptions} from './probeOptions';
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
// A node read again with only new probe times, as each poll is a new probe round: what memos and row caches compare is
// whether its readings moved. The times matter only for finding each kind's latest reading, so their order stands in
// for them.
const readings = (node: Node) => {
  const times = [...new Set(node.health.map(row => Date.parse(row.observed_at)))].sort((a, b) => a - b);
  const health = node.health.map((row: HealthObservation) => ({...row, observed_at: times.indexOf(Date.parse(row.observed_at))}));
  return JSON.stringify({...node, health});
};
// `next` with every node whose readings did not move kept as its object from `previous`, and `previous` itself when no
// node moved, so a poll re-renders only what reads a node that changed.
export function steadyNodes(previous: Node[], next: Node[]): Node[] {
  const before = new Map(previous.map(node => [node.id, node]));
  let same = previous.length === next.length;
  const list = next.map((node, i) => {
    const old = before.get(node.id);
    const kept = old && old !== node && readings(old) === readings(node) ? old : node;
    if (kept !== previous[i]) same = false;
    return kept;
  });
  return same ? previous : list;
}
export function useSteadyNodes(data: Node[] | undefined): Node[] | undefined {
  const [held, setHeld] = useState({from: data, nodes: data});
  if (held.from === data) return held.nodes;
  const nodes = data && held.nodes ? steadyNodes(held.nodes, data) : data;
  setHeld({from: data, nodes});
  return nodes;
}
// One lookup by id per node list, shared by every card that reads the same list.
const indexes = new WeakMap<Node[], Map<string, Node>>();
export function nodeIndex(nodes: Node[]): Map<string, Node> {
  let index = indexes.get(nodes);
  if (!index) indexes.set(nodes, (index = new Map(nodes.map(node => [node.id, node]))));
  return index;
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
  const stored = useProbeOptions();
  const api = getApi();
  const capabilities = useCapabilities();
  const {busy, run} = useAction<string>({rethrow: true});
  const choices = useCallback((node: Node) => probeChoices(capabilities.data, 'node', undefined, [node.protocol]), [capabilities.data]);
  const probe = useCallback(
    (node: Node, options = stored) => {
      const request = optionsProbe(capabilities.data, {type: 'node', node_id: node.id}, options, undefined, [node.protocol]);
      if (!request) return Promise.resolve(undefined);
      return run(node.id, async signal => {
        const accepted = await api.startProbe(request, signal);
        const result = await settle(api, accepted, signal);
        refetch();
        return {...finished(result, 'probe'), fallback: probeFallback(options.choice, request)};
      });
    },
    [api, capabilities.data, stored, run, refetch]
  );
  return {busy, probe, choices};
}
export function useGeodata(enabled = true) {
  const api = getApi();
  const resource = useResource({key: ['geodata'], every: 0, fetch: signal => api.geodata(signal)}, {enabled});
  const {refetch} = resource;
  // One update per backend: the Settings card and a refused write's repair show the same one busy, and it outlives
  // the page that started it.
  const {busy, run} = useAction<'update'>({rethrow: true, shared: 'geodata-update'});
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
