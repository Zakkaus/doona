import {useCallback, useEffect, useRef, useState, type DependencyList} from 'react';
import {getApi} from './index';
import type {Api} from './api';
import type {ApiEvent, FlowList, GroupSelectionRequest, Node} from './model';

type Listener = (event: ApiEvent) => void;
const streams = new Map<Api, {listeners: Set<Listener>; controller: AbortController}>();
export function useEvents(onEvent: Listener) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => { callback.current = onEvent; });
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let stream = streams.get(api);
    let active = true;
    const listener: Listener = event => callback.current(event);
    if (!stream) {
      stream = {listeners: new Set(), controller: new AbortController()};
      streams.set(api, stream);
      const shared = stream;
      shared.listeners.add(listener);
      void api.subscribeEvents({signal: shared.controller.signal, onEvent: event => shared.listeners.forEach(fn => fn(event))}).catch(reason => {
        if (active) setError(reason instanceof Error ? reason : new Error(String(reason)));
      });
    } else stream.listeners.add(listener);
    return () => {
      active = false;
      stream.listeners.delete(listener);
      if (!stream.listeners.size) { stream.controller.abort(); streams.delete(api); }
    };
  }, [api]);
  return error;
}

export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, {every = 5000, deps = []}: {every?: number; deps?: DependencyList} = {}) {
  const [state, setState] = useState<{data: T | undefined; loading: boolean; error: Error | null}>({data: undefined, loading: true, error: null});
  const current = useRef(fetcher);
  useEffect(() => { current.current = fetcher; });
  const refresh = useRef<() => void>(() => {});
  const refetch = useCallback(() => refresh.current(), []);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setState(previous => ({...previous, loading: true}));
      void current.current(request.signal).then(data => {
        if (!disposed && !request.signal.aborted) setState({data, loading: false, error: null});
      }, reason => {
        if (!disposed && !request.signal.aborted) setState(previous => ({...previous, loading: false, error: reason instanceof Error ? reason : new Error(String(reason))}));
      });
    };
    refresh.current = load;
    setState({data: undefined, loading: true, error: null});
    load();
    const timer = every > 0 ? setInterval(load, every) : undefined;
    return () => { disposed = true; controller?.abort(); clearInterval(timer); refresh.current = () => {}; };
  }, [every, ...deps]);
  useEvents(event => { if (event.event === 'runtime.updated') refetch(); });
  return {...state, refetch};
}
export function useRuntime() {
  const api = getApi();
  return useResource(signal => api.runtime(signal), {deps: [api]});
}
export function useNodes() {
  const api = getApi();
  return useResource(async signal => {
    const nodes: Node[] = [];
    let cursor: string | undefined;
    do {
      const result = await api.nodes({cursor, limit: 1000}, signal);
      nodes.push(...result.nodes);
      cursor = result.next_cursor ?? undefined;
    } while (cursor);
    return nodes;
  }, {deps: [api], every: 30000});
}
export function useGroups() {
  const api = getApi();
  return useResource(signal => api.groups(signal), {deps: [api], every: 30000});
}
export function useConnections() {
  const api = getApi();
  return useResource(signal => api.connections({type: 'all', limit: 1000}, signal), {deps: [api]});
}
export function useMockHistory() { return getApi().history(); }

export function useFlows() {
  const api = getApi();
  const resource = useResource(async signal => {
    let cursor: string | undefined;
    let snapshot: FlowList | undefined;
    do {
      const result = await api.flows({network: 'all', state: 'all', cursor, limit: 1000}, signal);
      if (snapshot) snapshot.flows.push(...result.flows); else snapshot = result;
      cursor = result.next_cursor ?? undefined;
    } while (cursor);
    return snapshot;
  }, {deps: [api]});
  useEvents(event => { if (event.event === 'flow.updated' || event.event === 'flow.gap') resource.refetch(); });
  return resource;
}

export function useFlow(id: string | null) {
  const api = getApi();
  const resource = useResource(signal => id ? api.flow(id, signal) : Promise.resolve(null), {deps: [api, id]});
  useEvents(event => { if (event.event === 'flow.gap' || (event.event === 'flow.updated' && event.data.resource_id === id)) resource.refetch(); });
  return resource;
}

export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void) {
  const api = getApi();
  const resource = useResource(signal => api.group(id, signal), {deps: [api, id], every: 30000});
  const [network, setNetwork] = useState<GroupSelectionRequest['network']>('both');
  const [busy, setBusy] = useState<'selection' | 'probe' | 'config' | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [api, id]);
  async function run<T>(kind: NonNullable<typeof busy>, action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(kind);
    setError(null);
    try {
      const result = await action(controller.signal);
      if (controller.signal.aborted) return;
      resource.refetch();
      refetchGroups();
      refetchNodes();
      return result;
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error(String(reason)));
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  }
  return {
    ...resource, error: error ?? resource.error, network, setNetwork, busy,
    select: (member_id: string) => run('selection', signal => api.selectGroup(id, {member_id, network}, signal)),
    probe: () => run('probe', async signal => {
      if (!resource.data?.capabilities.probe_transports.includes('tcp')) throw new Error('TCP probes are not supported');
      const accepted = await api.startProbe({target: {type: 'group', group_id: id}, kind: 'tcp_connect', purpose: 'data', transport: ['tcp'], warmth: 'warm', ip_version: 'ipv4', members: 'direct'}, signal);
      const result = await api.pollOperation(accepted, signal);
      if (result.status !== 'succeeded' || result.kind !== 'probe') throw new Error(result.error?.message ?? 'Probe failed');
      return result.result;
    }),
    setInterrupt: (value: boolean) => run('config', async signal => {
      if (!resource.data) throw new Error('Group is not loaded');
      const result = await api.patchGroup(id, [{op: 'replace', path: '/config/interrupt_connections', value}], '\"' + resource.data.config_revision + '\"', signal);
      if ('operation_id' in result) {
        const operation = await api.pollOperation(result, signal);
        if (operation.status !== 'succeeded') throw new Error(operation.error?.message ?? 'Group update failed');
      }
      return true;
    })
  };
}
