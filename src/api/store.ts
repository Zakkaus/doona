import {useCallback, useEffect, useRef, useState, type DependencyList} from 'react';
import {getApi} from './index';
import type {Api} from './api';
import type {ApiEvent, Node} from './model';

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
