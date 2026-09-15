import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DependencyList} from 'react';
import {getApi} from './index';
import type {Api} from './api';
import type {ApiEvent, Capabilities, DnsCacheList, DnsQueryResponse, FlowList, GroupSelectionRequest, Node, OperationAccepted, Runtime} from './model';
import type {RoutingTraceRequest, RoutingTraceResponse} from './model';
import {clientRows} from './selectors';

type Listener = (event: ApiEvent) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Stream = {listeners: Set<Listener>; statuses: Set<() => void>; controller: AbortController; status: StreamStatus; ready?: ApiEvent};
const streams = new Map<Api, Stream>();
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
export function useEvents(onEvent: Listener) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback(
    (notify: () => void) => {
      const listener: Listener = event => callback.current(event);
      let stream = streams.get(api);
      if (!stream) {
        stream = {listeners: new Set(), statuses: new Set(), controller: new AbortController(), status: initialStatus};
        streams.set(api, stream);
        const shared = stream;
        const update = (change: Partial<StreamStatus>) => {
          shared.status = {...shared.status, ...change};
          shared.statuses.forEach(fn => fn());
        };
        void api
          .capabilities(shared.controller.signal)
          .then(capabilities => {
            if (shared.controller.signal.aborted) return;
            update({available: capabilities.resources.events.available});
            if (!capabilities.resources.events.available) return;
            return api.subscribeEvents({
              signal: shared.controller.signal,
              onConnectionChange: connected => update({connected}),
              onEvent: event => {
                if (event.event === 'stream.ready') {
                  shared.ready = event;
                  update({cursor: event.id, error: null});
                }
                shared.listeners.forEach(fn => fn(event));
              }
            });
          })
          .catch(reason => {
            if (!shared.controller.signal.aborted) update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
          });
      }
      stream.listeners.add(listener);
      stream.statuses.add(notify);
      if (stream.ready) listener(stream.ready);
      return () => {
        stream.listeners.delete(listener);
        stream.statuses.delete(notify);
        if (!stream.listeners.size) {
          stream.controller.abort();
          streams.delete(api);
        }
      };
    },
    [api]
  );
  const getSnapshot = useCallback(() => streams.get(api)?.status ?? initialStatus, [api]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useEventFeed() {
  const api = getApi();
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [previousApi, setPreviousApi] = useState(api);
  if (previousApi !== api) {
    setPreviousApi(api);
    setEvents([]);
  }
  const status = useEvents(event => setEvents(previous => [event, ...previous.filter(item => item.id !== event.id)].slice(0, 200)));
  return {...status, events};
}

export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  {every = 5000, deps = [], enabled = true}: {every?: number; deps?: DependencyList; enabled?: boolean} = {}
) {
  const [key, setKey] = useState(() => ({every, enabled, deps}));
  const [state, setState] = useState<{data: T | undefined; loading: boolean; error: Error | null}>({data: undefined, loading: enabled, error: null});
  // Match React's dependency comparison without serializing API object identities.
  if (!Object.is(key.every, every) || key.enabled !== enabled || key.deps.length !== deps.length || deps.some((dep, i) => !Object.is(dep, key.deps[i]))) {
    setKey({every, enabled, deps});
    setState({data: undefined, loading: enabled, error: null});
  }
  const current = useRef(fetcher);
  useEffect(() => {
    current.current = fetcher;
  });
  const refresh = useRef<() => void>(() => {});
  const refetch = useCallback(() => refresh.current(), []);
  useEffect(() => {
    if (!key.enabled) return;
    let controller: AbortController | undefined;
    let disposed = false;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void current.current(request.signal).then(
        data => {
          if (!disposed && !request.signal.aborted) setState({data, loading: false, error: null});
        },
        reason => {
          if (!disposed && !request.signal.aborted)
            setState(previous => ({...previous, loading: false, error: reason instanceof Error ? reason : new Error(String(reason))}));
        }
      );
    };
    refresh.current = () => {
      setState(previous => ({...previous, loading: true}));
      load();
    };
    load();
    const timer = key.every > 0 ? setInterval(refresh.current, key.every) : undefined;
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      refresh.current = () => {};
    };
  }, [key]);
  useEvents(event => {
    if (event.event === 'runtime.updated') refetch();
  });
  return {...state, refetch};
}
export function useRuntime(enabled = true) {
  const api = getApi();
  return useResource(signal => api.runtime(signal), {deps: [api], enabled});
}
export function useRuntimeOutbounds(enabled: boolean) {
  const api = getApi();
  return useResource(signal => api.runtimeOutbounds(signal), {deps: [api], enabled});
}
const historyWindows: Record<string, number> = {live: 720, h1: 3600, h6: 21600, h24: 86400, d7: 604800};
export function useTrafficHistory(range: string, capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.traffic_history;
  const window_seconds = Math.min(historyWindows[range] ?? 720, limits?.max_window_seconds ?? 720);
  const max_points = Math.min(360, limits?.max_points ?? 360);
  return useResource(signal => api.trafficHistory({window_seconds, max_points}, signal), {
    deps: [api, window_seconds, max_points],
    enabled: limits?.available === true
  });
}
export function useNodes() {
  const api = getApi();
  return useResource(
    async signal => {
      const nodes: Node[] = [];
      let cursor: string | undefined;
      do {
        const result = await api.nodes({cursor, limit: 1000}, signal);
        nodes.push(...result.nodes);
        cursor = result.next_cursor ?? undefined;
      } while (cursor);
      return nodes;
    },
    {deps: [api], every: 30000}
  );
}
export function useGroups() {
  const api = getApi();
  return useResource(signal => api.groups(signal), {deps: [api], every: 30000});
}
export function useConnections(src?: string) {
  const api = getApi();
  return useResource(signal => api.connections({type: 'all', detail: 'full', limit: 1000, src}, signal), {deps: [api, src]});
}
export function useConfigRules() {
  return getApi().configRules();
}

const firstSeen = new Map<string, string>();
export function useClients() {
  const connections = useConnections();
  const rows = useMemo(() => {
    const now = new Date().toISOString();
    return clientRows(connections.data).map(row => {
      if (!firstSeen.has(row.ip)) firstSeen.set(row.ip, now);
      return {...row, firstSeen: firstSeen.get(row.ip)!};
    });
  }, [connections.data]);
  return {...connections, rows};
}

export function useRoutingTrace() {
  const api = getApi();
  const capabilities = useCapabilities();
  const [form, setForm] = useState({
    network: 'tcp' as 'tcp' | 'udp',
    domain: 'api.telegram.org',
    dst_ip: '',
    dst_port: '443',
    src_ip: '',
    src_port: '',
    pname: '',
    resolve: 'none' as 'none' | 'live'
  });
  const [result, setResult] = useState<RoutingTraceResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [api]
  );
  const portValid = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
  const invalid =
    !form.domain.trim() && !form.dst_ip.trim()
      ? '請提供域名或目的 IP。'
      : !portValid(form.dst_port) || (form.src_port.trim() && !portValid(form.src_port))
        ? '連接埠須為 1 至 65535 的整數。'
        : form.resolve === 'live' && (!form.domain.trim() || form.dst_ip.trim())
          ? '即時解析須提供域名，且目的 IP 必須留空。'
          : null;
  const resource = capabilities.data?.resources.routing_trace;
  const modes = resource?.resolve_modes ?? ['none', 'live'];
  const available = resource?.available !== false;
  async function submit() {
    if (active.current || invalid || !available || !modes.includes(form.resolve)) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    const input: RoutingTraceRequest['input'] = {
      network: form.network,
      dst_port: Number(form.dst_port),
      ...(form.domain.trim() ? {domain: form.domain.trim()} : {dst_ip: form.dst_ip.trim().replace(/^\[|\]$/g, '')})
    };
    if (form.dst_ip.trim()) input.dst_ip = form.dst_ip.trim().replace(/^\[|\]$/g, '');
    if (form.src_ip.trim()) input.src_ip = form.src_ip.trim().replace(/^\[|\]$/g, '');
    if (form.src_port.trim()) input.src_port = Number(form.src_port);
    if (form.pname.trim()) input.pname = form.pname.trim();
    try {
      const response = await api.routingTrace({input, resolve: form.resolve}, controller.signal);
      if (!controller.signal.aborted) setResult(response);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error(String(reason)));
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return {form, setForm, result, error: error ?? capabilities.error, busy, submit, invalid, available, modes};
}

export function useFlows(connection_id?: string) {
  const api = getApi();
  const resource = useResource(
    async signal => {
      let cursor: string | undefined;
      let snapshot: FlowList | undefined;
      do {
        const result = await api.flows({network: 'all', state: 'all', connection_id, cursor, limit: 1000}, signal);
        if (snapshot) snapshot.flows.push(...result.flows);
        else snapshot = result;
        cursor = result.next_cursor ?? undefined;
      } while (cursor);
      return snapshot;
    },
    {deps: [api, connection_id]}
  );
  useEvents(event => {
    if (event.event === 'flow.updated' || event.event === 'flow.gap') resource.refetch();
  });
  return resource;
}

export function useFlow(id: string | null) {
  const api = getApi();
  const resource = useResource(signal => (id ? api.flow(id, signal) : Promise.resolve(null)), {deps: [api, id]});
  useEvents(event => {
    if (event.event === 'flow.gap' || (event.event === 'flow.updated' && event.data.resource_id === id)) resource.refetch();
  });
  return resource;
}

export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void) {
  const api = getApi();
  const resource = useResource(signal => api.group(id, signal), {deps: [api, id], every: 30000});
  const [network, setNetwork] = useState<GroupSelectionRequest['network']>('both');
  const [busy, setBusy] = useState<'selection' | 'probe' | 'config' | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [api, id]
  );
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
    ...resource,
    error: error ?? resource.error,
    network,
    setNetwork,
    busy,
    select: (member_id: string) => run('selection', signal => api.selectGroup(id, {member_id, network}, signal)),
    probe: () =>
      run('probe', async signal => {
        if (!resource.data?.capabilities.probe_transports.includes('tcp')) throw new Error('TCP probes are not supported');
        const accepted = await api.startProbe(
          {
            target: {type: 'group', group_id: id},
            kind: 'tcp_connect',
            purpose: 'data',
            transport: ['tcp'],
            warmth: 'warm',
            ip_version: 'ipv4',
            members: 'direct'
          },
          signal
        );
        const result = await api.pollOperation(accepted, signal);
        if (result.status !== 'succeeded' || result.kind !== 'probe') throw new Error(result.error?.message ?? 'Probe failed');
        return result.result;
      }),
    setInterrupt: (value: boolean) =>
      run('config', async signal => {
        if (!resource.data) throw new Error('Group is not loaded');
        const result = await api.patchGroup(
          id,
          [{op: 'replace', path: '/config/interrupt_connections', value}],
          '\"' + resource.data.config_revision + '\"',
          signal
        );
        if ('operation_id' in result) {
          const operation = await api.pollOperation(result, signal);
          if (operation.status !== 'succeeded') throw new Error(operation.error?.message ?? 'Group update failed');
        }
        return true;
      })
  };
}

export function useCapabilities() {
  const api = getApi();
  return useResource(signal => api.capabilities(signal), {deps: [api], every: 0});
}
export function useDatapath(enabled = true) {
  const api = getApi();
  return useResource(signal => api.datapath('full', signal), {deps: [api], enabled});
}
export function useRuntimeMemory(enabled = true) {
  const api = getApi();
  return useResource(signal => api.runtimeMemory(signal), {deps: [api], enabled});
}
export function useDnsCache(enabled = true) {
  const api = getApi();
  return useResource(
    async signal => {
      let cursor: string | undefined;
      let snapshot: DnsCacheList | undefined;
      do {
        const result = await api.dnsCache({cursor, limit: 1000, detail: 'full'}, signal);
        if (snapshot) snapshot.entries.push(...result.entries);
        else snapshot = result;
        cursor = result.next_cursor ?? undefined;
      } while (cursor);
      return snapshot!;
    },
    {deps: [api], enabled}
  );
}

type RuntimeAction = 'reload' | 'suspend' | 'resume';
export function useRuntimeOperations(runtime: Runtime | undefined, capabilities: Capabilities | undefined, refetch: () => void) {
  const api = getApi();
  const [busy, setBusy] = useState<RuntimeAction | null>(null);
  const [operation, setOperation] = useState<OperationAccepted | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [api]
  );
  const canRun = (kind: RuntimeAction) =>
    !!runtime &&
    !!capabilities?.resources.operations.available &&
    !!capabilities.resources[kind].available &&
    (kind === 'reload' || runtime.lifecycle.state === (kind === 'suspend' ? 'running' : 'suspended'));
  async function run(kind: RuntimeAction) {
    if (active.current || !canRun(kind)) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(kind);
    setError(null);
    try {
      const accepted = await (kind === 'reload' ? api.startReload : kind === 'suspend' ? api.startSuspend : api.startResume)(controller.signal);
      setOperation(accepted);
      const terminal = await api.pollOperation(accepted, controller.signal);
      if (controller.signal.aborted) return;
      refetch();
      if (terminal.status === 'failed') setError(new Error(terminal.error.message));
      return terminal;
    } catch (reason) {
      if (!controller.signal.aborted) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        setError(error);
        throw error;
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
        setOperation(null);
      }
    }
  }
  return {busy, operation, error, canRun, run};
}

export function useDnsControl() {
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const cache = useDnsCache(!!resources?.dns_cache.available && !!resources.dns_cache.read);
  const [result, setResult] = useState<DnsQueryResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [api]
  );
  async function run<T>(kind: string, action: (signal: AbortSignal) => Promise<T>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(kind);
    setError(null);
    try {
      const value = await action(controller.signal);
      if (!controller.signal.aborted) return value;
    } catch (reason) {
      if (!controller.signal.aborted) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        setError(error);
        throw error;
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  }
  return {
    capabilities,
    cache,
    result,
    busy,
    error,
    query: (domain: string, types: string[]) =>
      run('query', async signal => {
        const value = await api.dnsQuery(domain, types, signal);
        if (!signal.aborted) setResult(value);
        return value;
      }),
    remove: (id: string) =>
      run(id, async signal => {
        const value = await api.deleteDnsEntry(id, signal);
        cache.refetch();
        return value;
      }),
    flush: () =>
      run('flush', async signal => {
        const value = await api.flushDnsCache(signal);
        cache.refetch();
        return value;
      })
  };
}
