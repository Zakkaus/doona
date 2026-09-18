import type {Key} from '../i18n/messages';
import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DependencyList} from 'react';
import {getApi} from './index';
import type {Api} from './api';
import type {
  ApiEvent,
  Capabilities,
  DnsCacheList,
  DnsQueryResponse,
  FlowList,
  GroupSelectionRequest,
  Node,
  Runtime,
  RuntimeSettings,
  RuntimeSettingsPatch
} from './model';
import type {
  ConfigValidationRequest,
  ConfigValidationResult,
  LogLevel,
  LogRecord,
  Operation,
  OperationState,
  RoutingTraceRequest,
  RoutingTraceResponse,
  RuntimeMode,
  RuntimeModeRequest,
  ProviderCreate,
  ProviderList,
  ProbeRequest,
  BulkCloseQuery,
  BulkCloseResult,
  NodeCreate
} from './model';
import {ApiError, LocalError} from './error';
import {inflight, normalizeResourceKey, type RequestLease, type ResourceKey} from './inflight';
import {shouldRefetch} from './invalidation';
import type {OutboundNames} from './selectors';

type Listener = (event: ApiEvent, reconnected: boolean) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Stream = {listeners: Set<Listener>; statuses: Set<() => void>; controller: AbortController; status: StreamStatus; ready?: ApiEvent};
const streams = new Map<Api, Stream>();
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
const refreshers = new WeakMap<Api, Set<() => Promise<void> | undefined>>();

export async function refetchAll() {
  await Promise.allSettled([...(refreshers.get(getApi()) ?? [])].map(refresh => refresh()));
}
function useEvents(onEvent: Listener) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback(
    (notify: () => void) => {
      const listener: Listener = (event, reconnected) => callback.current(event, reconnected);
      let stream = streams.get(api);
      if (!stream) {
        stream = {listeners: new Set(), statuses: new Set(), controller: new AbortController(), status: initialStatus};
        streams.set(api, stream);
        const shared = stream;
        const update = (change: Partial<StreamStatus>) => {
          shared.status = {...shared.status, ...change};
          shared.statuses.forEach(fn => fn());
        };
        const request = inflight.acquire(api, normalizeResourceKey(['capabilities']), signal => api.capabilities(signal));
        shared.controller.signal.addEventListener('abort', request.release, {once: true});
        void request.promise
          .then(capabilities => {
            request.release();
            shared.controller.signal.removeEventListener('abort', request.release);
            if (shared.controller.signal.aborted) return;
            update({available: capabilities.resources.events.available});
            if (!capabilities.resources.events.available) return;
            return api.subscribeEvents({
              signal: shared.controller.signal,
              onConnectionChange: connected => update({connected}),
              onEvent: event => {
                const reconnected = event.event === 'stream.ready' && !!shared.ready;
                if (event.event === 'stream.ready') {
                  shared.ready = event;
                  update({cursor: event.id, error: null});
                }
                shared.listeners.forEach(fn => fn(event, reconnected));
              }
            });
          })
          .catch(reason => {
            request.release();
            shared.controller.signal.removeEventListener('abort', request.release);
            if (!shared.controller.signal.aborted) update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
          });
      }
      stream.listeners.add(listener);
      stream.statuses.add(notify);
      if (stream.ready) listener(stream.ready, false);
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

// How many events the feed keeps; the page's caption quotes the same number.
export const EVENT_FEED_LIMIT = 200;
export function useEventFeed() {
  const api = getApi();
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [previousApi, setPreviousApi] = useState(api);
  if (previousApi !== api) {
    setPreviousApi(api);
    setEvents([]);
  }
  const status = useEvents(event => setEvents(previous => [event, ...previous.filter(item => item.id !== event.id)].slice(0, EVENT_FEED_LIMIT)));
  return {...status, events};
}

type Resource<T> = {
  key: ResourceKey;
  fetch: (signal: AbortSignal) => Promise<T>;
  acceptEvent?: (event: ApiEvent) => boolean;
};

function useResource<T>(resource: Resource<T>, {every = 5000, deps = [], enabled = true}: {every?: number; deps?: DependencyList; enabled?: boolean} = {}) {
  const api = getApi();
  const name = normalizeResourceKey(resource.key);
  const lane = resource.key[0];
  const [key, setKey] = useState(() => ({api, name, every, enabled, deps}));
  const [state, setState] = useState<{data: T | undefined; loading: boolean; error: Error | null}>({data: undefined, loading: enabled, error: null});
  // Match React's dependency comparison without serializing API object identities.
  if (
    key.api !== api ||
    key.name !== name ||
    !Object.is(key.every, every) ||
    key.enabled !== enabled ||
    key.deps.length !== deps.length ||
    deps.some((dep, i) => !Object.is(dep, key.deps[i]))
  ) {
    setKey({api, name, every, enabled, deps});
    setState({data: undefined, loading: enabled, error: null});
  }
  const current = useRef(resource.fetch);
  useEffect(() => {
    current.current = resource.fetch;
  });
  const refresh = useRef<() => Promise<void> | undefined>(() => undefined);
  const refetch = useCallback(() => refresh.current(), []);
  useEffect(() => {
    if (!key.enabled) return;
    let pending: RequestLease<T> | undefined;
    let settled: Promise<void> | undefined;
    let disposed = false;
    const load = () => {
      if (pending) return settled;
      const request = inflight.acquire(key.api, key.name, current.current);
      pending = request;
      settled = request.promise.then(
        data => {
          pending = undefined;
          request.release();
          if (!disposed) setState({data, loading: false, error: null});
        },
        reason => {
          pending = undefined;
          request.release();
          if (!disposed) setState(previous => ({...previous, loading: false, error: reason instanceof Error ? reason : new Error(String(reason))}));
        }
      );
      return settled;
    };
    refresh.current = () => {
      setState(previous => ({...previous, loading: true}));
      return load();
    };
    let listeners = refreshers.get(key.api);
    if (!listeners) refreshers.set(key.api, (listeners = new Set()));
    // Every resource refetches on a manual refresh, the same way it does when the event stream reconnects.
    const invalidate = () => refresh.current();
    listeners.add(invalidate);
    load();
    const timer = key.every > 0 ? setInterval(refresh.current, key.every) : undefined;
    return () => {
      disposed = true;
      listeners.delete(invalidate);
      pending?.release();
      clearInterval(timer);
      refresh.current = () => undefined;
    };
  }, [key]);
  // A burst of events (one per flow change under load) becomes one refetch: the first event arms a short
  // timer, later ones ride on it. Reconnection refetches at once.
  const armed = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (armed.current) clearTimeout(armed.current);
    },
    []
  );
  useEvents((event, reconnected) => {
    if (!shouldRefetch(lane, event, reconnected) || !(resource.acceptEvent?.(event) ?? true)) return;
    if (reconnected) {
      refetch();
      return;
    }
    if (armed.current) return;
    armed.current = setTimeout(() => {
      armed.current = null;
      refetch();
    }, 2000);
  });
  return {...state, refetch};
}
export function useVersion() {
  const api = getApi();
  return useResource({key: ['version'], fetch: signal => api.version(signal)}, {deps: [api], every: 0});
}
export function useRuntime(enabled = true) {
  const api = getApi();
  return useResource({key: ['runtime'], fetch: signal => api.runtime(signal)}, {deps: [api], enabled});
}
export function useRuntimeOutbounds(enabled: boolean) {
  const api = getApi();
  return useResource({key: ['runtimeOutbounds'], fetch: signal => api.runtimeOutbounds(signal)}, {deps: [api], enabled});
}
// The backend's ring, asked for the chart's window (or as much of it as the backend keeps) at its full
// resolution: the live window wants every second the backend has.
export function useTrafficHistory(windowSeconds: number, capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.traffic_history;
  const window_seconds = Math.min(windowSeconds, limits?.max_window_seconds ?? 600);
  const max_points = Math.min(600, limits?.max_points ?? 600);
  return useResource(
    {key: ['trafficHistory', {window_seconds, max_points}], fetch: signal => api.trafficHistory({window_seconds, max_points}, signal)},
    {
      deps: [api, window_seconds, max_points],
      enabled: limits?.available === true
    }
  );
}
// Ten minutes at the recorder cadence; the chart shows what the producer retained, not a local accumulation.
export function useMemoryHistory(capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.memory_history;
  const window_seconds = Math.min(600, limits?.max_window_seconds ?? 600);
  const max_points = Math.min(120, limits?.max_points ?? 120);
  return useResource(
    {key: ['memoryHistory', {window_seconds, max_points}], fetch: signal => api.memoryHistory({window_seconds, max_points}, signal)},
    {deps: [api, window_seconds, max_points], enabled: limits?.available === true}
  );
}
// Walks a cursor-paged list to its end. A cursor the backend no longer honours (400 for an unknown or expired
// cursor, 410 for a gone snapshot) restarts the walk once from the head, which is what the contract asks for.
async function walk<P extends {next_cursor: string | null}, T>(
  page: (cursor: string | undefined) => Promise<P>,
  take: (acc: T | undefined, p: P) => T
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      let acc: T | undefined;
      let cursor: string | undefined;
      do {
        const result = await page(cursor);
        acc = take(acc, result);
        cursor = result.next_cursor ?? undefined;
      } while (cursor);
      return acc!;
    } catch (error) {
      if (attempt === 0 && error instanceof ApiError && (error.status === 410 || (error.status === 400 && error.code === 'invalid_request'))) continue;
      throw error;
    }
  }
}
// The page size a resource advertises, capped at the wire ceiling; undefined until the capabilities are known,
// which leaves the backend's own default in force rather than guessing above its ceiling.
const pageSize = (capabilities: Capabilities | undefined, max: number | undefined) => (capabilities ? Math.min(1000, max ?? 1000) : undefined);

// Nodes and groups are fetched only when the backend declares them (honk's first release has neither).
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
// Group and node ids as the config names them, for chains the backend reports by id.
export function useOutboundNames(): OutboundNames {
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  return useMemo(
    () => new Map([...(groups.data ?? []).map(g => [g.id, g.name] as const), ...(nodes.data ?? []).map(n => [n.id, n.name] as const)]),
    [groups.data, nodes.data]
  );
}
export function useGroups(enabled = true) {
  const api = getApi();
  return useResource({key: ['groups'], fetch: signal => api.groups(signal)}, {deps: [api], every: 30000, enabled});
}
export function useConnections(src?: string, enabled = true) {
  const api = getApi();
  return useResource(
    {key: ['connections', {src}], fetch: signal => api.connections({type: 'all', detail: 'full', limit: 1000, src}, signal)},
    {deps: [api, src], enabled}
  );
}

// Closing one connection: the list refetches on success; a 409 is the backend saying it does not own the transport.
// One action at a time per hook. The action gets a signal that aborts with the api, with `scope`, or on unmount;
// a result after an abort is dropped, a failure is kept as `error` and, with `rethrow`, thrown again for the
// caller's toast.
function useAction<K extends string>({scope, rethrow = false}: {scope?: unknown; rethrow?: boolean} = {}) {
  const api = getApi();
  const [busy, setBusy] = useState<K | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [api, scope]
  );
  async function run<T>(kind: K, action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (active.current) return undefined;
    const controller = new AbortController();
    active.current = controller;
    setBusy(kind);
    setError(null);
    try {
      const result = await action(controller.signal);
      return controller.signal.aborted ? undefined : result;
    } catch (reason) {
      if (controller.signal.aborted) return undefined;
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      setError(failure);
      if (rethrow) throw failure;
      return undefined;
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  }
  return {busy, error, setError, run};
}
// If-Match carries the revision as a quoted entity tag.
const etag = (revision: string) => '"' + revision + '"';
// The result of a finished operation of the expected kind; anything else is a failure carrying the backend's message.
type SucceededResult<K extends Operation['kind']> = Extract<Operation, {kind: K; status: 'succeeded'}>['result'];
function finished<K extends Operation['kind']>(operation: OperationState, kind: K): SucceededResult<K> {
  if (operation.status === 'succeeded' && operation.kind === kind) return operation.result as SucceededResult<K>;
  throw new LocalError('ui.operationFailed', operation.error?.message ?? null);
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
  const {busy, error, run} = useAction<'trace'>();
  const portValid = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
  const invalid: Key | null =
    !form.domain.trim() && !form.dst_ip.trim()
      ? 'rule.invalidTarget'
      : !portValid(form.dst_port) || (form.src_port.trim() && !portValid(form.src_port))
        ? 'rule.invalidPort'
        : form.resolve === 'live' && (!form.domain.trim() || form.dst_ip.trim())
          ? 'rule.invalidLive'
          : null;
  const resource = capabilities.data?.resources.routing_trace;
  const modes = resource?.resolve_modes ?? ['none', 'live'];
  const available = resource?.available !== false;
  async function submit() {
    if (busy || invalid || !available || !modes.includes(form.resolve)) return;
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
    const response = await run('trace', signal => api.routingTrace({input, resolve: form.resolve}, signal));
    if (response) setResult(response);
  }
  return {form, setForm, result, error: error ?? capabilities.error, busy: busy !== null, submit, invalid, available, modes};
}

export function useFlows(connection_id?: string, enabled = true) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const limit = pageSize(capabilities, capabilities?.resources.flows.max_page_size);
  return useResource(
    {
      key: ['flows', {connection_id}],
      fetch: signal =>
        walk(
          cursor => api.flows({network: 'all', state: 'all', connection_id, cursor, limit, detail: 'full'}, signal),
          (acc: FlowList | undefined, page) => (acc ? {...acc, flows: [...acc.flows, ...page.flows]} : page)
        )
    },
    // Every list request opens a bounded snapshot on the backend (honk keeps eight for 30 s), so this polls at
    // a third of the usual cadence; events still refetch it the moment a flow changes.
    {deps: [api, connection_id, limit], enabled, every: 15000}
  );
}

export function useFlow(id: string | null) {
  const api = getApi();
  return useResource(
    {
      key: ['flow', {id}],
      fetch: signal => (id ? api.flow(id, signal) : Promise.resolve(null)),
      acceptEvent: event => event.event !== 'flow.updated' || event.data.resource_id === id
    },
    {deps: [api, id]}
  );
}

export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const resource = useResource({key: ['group', {id}], fetch: signal => api.group(id, signal)}, {deps: [api, id], every: 30000});
  const [network, setNetwork] = useState<GroupSelectionRequest['network']>('both');
  const action = useAction<'selection' | 'probe' | 'config'>({scope: id});
  // Every control changes what the lists show, so all three refetch once it has gone through.
  async function run<T>(kind: 'selection' | 'probe' | 'config', act: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const result = await action.run(kind, act);
    if (result !== undefined) {
      resource.refetch();
      refetchGroups();
      refetchNodes();
    }
    return result;
  }
  // A TCP probe needs the backend to offer it and the group to accept it.
  const canProbe = tcpProbe(capabilities, {type: 'group', group_id: id}) !== null && (resource.data?.capabilities.probe_transports.includes('tcp') ?? false);
  return {
    ...resource,
    // The load error stays with the resource (shown inline); `actionError` is the last control that failed.
    error: resource.error,
    actionError: action.error,
    network,
    setNetwork,
    busy: action.busy,
    canProbe,
    select: (member_id: string) => run('selection', signal => api.selectGroup(id, {member_id, network}, signal)),
    clearOverride: () => run('selection', signal => api.clearGroupOverride(id, network, signal)),
    probe: () =>
      run('probe', async signal => {
        const request = tcpProbe(capabilities, {type: 'group', group_id: id});
        if (!request || !canProbe) throw new LocalError('ui.probeUnsupported');
        const accepted = await api.startProbe(request, signal);
        return finished(await api.pollOperation(accepted, signal), 'probe');
      }),
    setInterrupt: (value: boolean) =>
      run('config', async signal => {
        if (!resource.data) throw new LocalError('ui.groupNotLoaded');
        const result = await api.patchGroup(id, [{op: 'replace', path: '/config/interrupt_connections', value}], etag(resource.data.config_revision), signal);
        if ('operation_id' in result) finished(await api.pollOperation(result, signal), 'group_update');
        return true;
      })
  };
}

export function useCapabilities() {
  const api = getApi();
  return useResource({key: ['capabilities'], fetch: signal => api.capabilities(signal)}, {deps: [api], every: 0});
}
export function useDatapath(enabled = true) {
  const api = getApi();
  return useResource({key: ['datapath', {detail: 'full'}], fetch: signal => api.datapath('full', signal)}, {deps: [api], enabled});
}
// Runtime-adjustable settings: read with the usual poll, written as one merge PATCH; the response replaces
// the cached copy so the form reflects what the backend actually kept.
// A write's reply stands in for the polled value until a newer poll arrives, so the form does not flash back to
// the old values. The reply is tied to the backend it came from; switching backends forgets it.
const newest = <T extends {observed_at: string}>(written: T | null, polled: T | undefined) =>
  written && (!polled || Date.parse(written.observed_at) >= Date.parse(polled.observed_at)) ? written : polled;
export function useRuntimeSettings(enabled = true) {
  const api = getApi();
  const resource = useResource({key: ['runtimeSettings'], fetch: signal => api.runtimeSettings(signal)}, {deps: [api], enabled});
  const {busy, run} = useAction<'save'>({rethrow: true});
  const [saved, setSaved] = useState<{api: Api; value: RuntimeSettings} | null>(null);
  const save = (patch: RuntimeSettingsPatch) =>
    run('save', async signal => {
      const next = await api.patchRuntimeSettings(patch, signal);
      setSaved({api, value: next});
      resource.refetch();
      return next;
    });
  return {...resource, data: newest(saved?.api === api ? saved.value : null, resource.data), busy: busy !== null, save};
}
// The engine's log stream, newest first, bounded; filters restart the stream from the ring. Paused keeps the
// stream open but stops appending, so the list can be read.
export function useLogFeed({level, target, paused, limit = 1000}: {level?: LogLevel; target?: string; paused: boolean; limit?: number}) {
  const api = getApi();
  const capabilities = useCapabilities();
  const available = capabilities.data?.resources.logs.available;
  const [records, setRecords] = useState<Array<LogRecord & {id: string}>>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // A filter change starts a new stream; the list is emptied during render, not inside the effect.
  const [filterKey, setFilterKey] = useState({api, level, target});
  if (filterKey.api !== api || filterKey.level !== level || filterKey.target !== target) {
    setFilterKey({api, level, target});
    setRecords([]);
    setError(null);
  }
  const hold = useRef(paused);
  useEffect(() => {
    hold.current = paused;
  }, [paused]);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    api
      .subscribeLogs({
        level,
        target: target || undefined,
        signal: controller.signal,
        onConnectionChange: setConnected,
        onRecord: record => {
          if (hold.current) return;
          // A resumed stream may replay the record the cursor pointed at; the id keeps it single.
          setRecords(previous => (previous.some(item => item.id === record.id) ? previous : [record, ...previous].slice(0, limit)));
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error(String(reason)));
      });
    return () => controller.abort();
  }, [api, available, level, target, limit]);
  return {records, connected, error, available, clear: () => setRecords([])};
}
// The outbound mode switch: read with the usual poll, set at once; the reply replaces the cached copy.
export function useRuntimeMode(enabled = true) {
  const api = getApi();
  const resource = useResource({key: ['runtimeMode'], fetch: signal => api.runtimeMode(signal)}, {deps: [api], enabled});
  const {busy, run} = useAction<'change'>({rethrow: true});
  const [set, setSet] = useState<{api: Api; value: RuntimeMode} | null>(null);
  const override = set?.api === api ? set.value : null;
  const change = (request: RuntimeModeRequest) =>
    run('change', async signal => {
      const next = await api.setRuntimeMode(request, signal);
      setSet({api, value: next});
      resource.refetch();
      return next;
    });
  return {...resource, data: newest(override, resource.data), busy: busy !== null, change};
}
// Where nodes come from, and a refresh that re-reads one source through an operation.
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
  const refresh = (id: string) =>
    run(id, async signal => {
      const accepted = await api.refreshProvider(id, signal);
      const result = await api.pollOperation(accepted, signal);
      refetch();
      return finished(result, 'provider_refresh');
    });
  return {busy, refresh};
}
// Adding and removing subscriptions and inline nodes: each call rewrites the managed main source and starts a new
// generation, so the lists refetch on generation.changed; `refetch` covers a backend without events.
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
// The one probe shape the UI sends: a warm TCP connect for data, over whatever IP versions the backend reaches
// (a v6-only node is not a failure). Null when the backend does not advertise that probe.
export function tcpProbe(capabilities: Capabilities | undefined, target: ProbeRequest['target']): ProbeRequest | null {
  const probes = capabilities?.resources.probes;
  if (!probes?.available || !probes.kinds?.includes('tcp_connect') || !probes.transports?.includes('tcp') || !probes.targets?.includes(target.type))
    return null;
  return {
    target,
    kind: 'tcp_connect',
    purpose: 'data',
    transport: ['tcp'],
    warmth: 'warm',
    ip_version: probes.ip_versions?.includes('ipv6') ? 'any' : 'ipv4',
    members: 'direct'
  };
}
// One TCP probe of one node, for the node table; the group card probes whole groups.
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
// Flushing the whole DNS cache, for pages that do not carry the DNS page's full control set.
export function useDnsFlush() {
  const api = getApi();
  const {busy, run} = useAction<'flush'>({rethrow: true});
  return {busy: busy !== null, flush: () => run('flush', signal => api.flushDnsCache(signal))};
}
// The rule dictionary of the running generation; refetched on generation.changed.
export function useRules(enabled = true) {
  const api = getApi();
  return useResource({key: ['rules'], fetch: signal => api.rules(signal)}, {deps: [api], enabled, every: 0});
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
// The accepted configuration: sources, diagnostics and the running generation; refetched on generation.changed.
export function useConfig(enabled = true) {
  const api = getApi();
  return useResource({key: ['config'], fetch: signal => api.config(signal)}, {deps: [api], enabled, every: 0});
}
// Dry-run validation and single-source replacement. Saving follows the contract's editor flow: the server
// validates in full before writing; a 422 comes back as an error whose details carry the diagnostics.
export function useConfigEditor(refetch: () => void) {
  const api = getApi();
  const {busy, error, run} = useAction<'validate' | 'save'>();
  // The source the last action concerned, so only that source's card shows a rejected save's diagnostics.
  const [sourceId, setSourceId] = useState<string | null>(null);
  return {
    busy,
    error,
    errorSource: error ? sourceId : null,
    validate: (request: ConfigValidationRequest): Promise<ConfigValidationResult | undefined> => {
      setSourceId(request.sources.length === 1 ? (request.sources[0].id ?? null) : null);
      return run('validate', signal => api.validateConfig(request, signal));
    },
    save: (id: string, content: string, sha256: string) => {
      setSourceId(id);
      return run('save', async signal => {
        const accepted = await api.replaceConfigSource(id, content, etag(sha256), signal);
        const result = await api.pollOperation(accepted, signal);
        refetch();
        return finished(result, 'reload');
      });
    }
  };
}
export function useRuntimeMemory(enabled = true) {
  const api = getApi();
  return useResource({key: ['runtimeMemory'], fetch: signal => api.runtimeMemory(signal)}, {deps: [api], enabled});
}
// The newest page of the resolver's ring, filtered server-side; the ring refreshes with the usual poll.
export function useDnsLog(query: {name?: string; type?: string; src?: string}, enabled = true) {
  const api = getApi();
  const name = query.name?.trim() || undefined;
  const type = query.type && query.type !== 'all' ? query.type : undefined;
  const src = query.src?.trim() || undefined;
  const capabilities = useCapabilities().data;
  const advertised = pageSize(capabilities, capabilities?.resources.dns_log.max_page_size);
  const limit = advertised === undefined ? undefined : Math.min(200, advertised);
  return useResource(
    {key: ['dnsLog', {name, type, src}], fetch: signal => api.dnsLog({name, type: type as never, src, limit}, signal)},
    {deps: [api, name, type, src, limit], enabled}
  );
}
function useDnsCache(enabled = true) {
  const api = getApi();
  return useResource(
    {
      key: ['dnsCache'],
      fetch: signal =>
        walk(
          cursor => api.dnsCache({cursor, limit: 1000, detail: 'full'}, signal),
          (acc: DnsCacheList | undefined, page) => (acc ? {...acc, entries: [...acc.entries, ...page.entries]} : page)
        )
    },
    {deps: [api], enabled}
  );
}

type RuntimeAction = 'reload' | 'suspend' | 'resume';
export function useRuntimeOperations(runtime: Runtime | undefined, capabilities: Capabilities | undefined, refetch: () => void) {
  const api = getApi();
  const action = useAction<RuntimeAction>({rethrow: true});
  const canRun = (kind: RuntimeAction) =>
    !!runtime &&
    !!capabilities?.resources.operations.available &&
    !!capabilities.resources[kind].available &&
    (kind === 'reload' || runtime.lifecycle.state === (kind === 'suspend' ? 'running' : 'suspended'));
  const run = (kind: RuntimeAction) => {
    if (!canRun(kind)) return Promise.resolve(undefined);
    return action.run(kind, async signal => {
      const accepted = await (kind === 'reload' ? api.startReload : kind === 'suspend' ? api.startSuspend : api.startResume)(signal);
      const terminal = await api.pollOperation(accepted, signal);
      refetch();
      finished(terminal, kind);
      return terminal as Extract<Operation, {status: 'succeeded'}>;
    });
  };
  return {busy: action.busy, error: action.error, canRun, run};
}

export function useDnsControl() {
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const cache = useDnsCache(!!resources?.dns_cache.available && !!resources.dns_cache.read);
  const [result, setResult] = useState<DnsQueryResponse | null>(null);
  const {busy, error, run} = useAction<string>({rethrow: true});
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
