import {createContext, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {Go} from '../features/types';
import {shouldOpenSettings} from '../features/settings/settings';
import {features, type RoutePath} from './registry';

type Route = {route: RoutePath; query: string};
export const DraftContext = createContext<{setDirty: (dirty: boolean) => void; revision: number}>({setDirty: () => {}, revision: 0});

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const i = h.indexOf('?');
  const route = {route: (i < 0 ? h : h.slice(0, i)) || 'activity', query: i < 0 ? '' : h.slice(i + 1)};
  if (route.route === 'flows') return legacyFlows(route.query);
  return {route: features.find(feature => feature.path === route.route)?.path ?? 'activity', query: route.query};
}
// The flow map and records moved under rules; old links keep working.
function legacyFlows(query: string): Route {
  const params = new URLSearchParams(query);
  params.set('tab', params.has('id') || params.has('connection_id') || params.has('path') ? 'flows' : 'map');
  return {route: 'rules', query: params.toString()};
}

export function within(query: string, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(query);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next.toString();
}

export function href(route: RoutePath, params: Record<string, string | null> = {}): string {
  return buildHash(route, within('', params));
}

export function pickTab<T extends string>(query: string, ids: readonly T[], fallback: T): T {
  const requested = new URLSearchParams(query).get('tab');
  return ids.find(id => id === requested) ?? fallback;
}

export function buildHash(route: RoutePath, query?: string): string {
  return '#/' + route + (query ? '?' + query : '');
}

export function updateRoute(current: Route, hash: string): Route {
  const next = parseHash(hash);
  return current.route === next.route && current.query === next.query ? current : next;
}

type PendingRoute = Route & {delta?: number};

export function restoreDraftRoute(current: Route, position: number): number | undefined {
  const destination: unknown = history.state?.doonaPosition;
  const delta = typeof destination === 'number' ? destination - position : 0;
  if (delta) {
    history.go(-delta);
    return delta;
  }
  // An unindexed destination has no known direction; restore in place rather than traverse.
  history.replaceState({...history.state, doonaPosition: position}, '', buildHash(current.route, current.query));
}

function currentHash(api: string | null): string {
  if (shouldOpenSettings(api, location.hash)) history.replaceState(history.state, '', buildHash('settings'));
  else {
    const {route, query} = parseHash(location.hash);
    const canonical = buildHash(route, query);
    if (location.hash !== canonical) history.replaceState(history.state, '', canonical);
  }
  return location.hash;
}

export function useRoute(api: string | null) {
  const [loc, setLoc] = useState(() => {
    const hash = currentHash(api);
    history.replaceState({...history.state, doonaPosition: history.state?.doonaPosition ?? 0}, '', hash);
    return parseHash(hash);
  });
  const position = useRef<number>(history.state.doonaPosition);
  const restoring = useRef<PendingRoute | null>(null);
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<PendingRoute | null>(null);
  const push = useCallback((next: Route, replace = false) => {
    if (replace) history.replaceState({...history.state, doonaPosition: position.current}, '', buildHash(next.route, next.query));
    else history.pushState({doonaPosition: ++position.current}, '', buildHash(next.route, next.query));
    setLoc(next);
  }, []);
  // `go` keeps one identity across navigations, so memoised pages and tiles are not re-rendered by the callback alone.
  const current = useRef(loc);
  useLayoutEffect(() => {
    current.current = loc;
  }, [loc]);
  const go = useCallback<Go>(
    (route, query = '', options) => {
      const next = updateRoute(current.current, buildHash(route, query));
      if (next === current.current) return;
      if (dirty.current) setPending(next);
      else push(next, options?.replace);
    },
    [push]
  );
  useEffect(() => {
    const on = () => {
      // Only the traversal back to the draft's own entry completes a restore; if the browser dropped it, this
      // is an ordinary navigation and is handled as one.
      const restored = restoring.current;
      restoring.current = null;
      if (restored && history.state?.doonaPosition === position.current) {
        setPending(restored);
        return;
      }
      const hash = currentHash(api);
      const nextPosition: number = history.state?.doonaPosition ?? position.current;
      const next = updateRoute(loc, hash);
      if (next !== loc && dirty.current) {
        const delta = restoreDraftRoute(loc, position.current);
        if (delta !== undefined) {
          restoring.current = {...next, delta};
        } else {
          setPending(next);
        }
      } else {
        if (history.state?.doonaPosition === undefined) history.replaceState({...history.state, doonaPosition: nextPosition}, '', hash);
        position.current = nextPosition;
        setLoc(next);
      }
    };
    // popstate, not hashchange: it also fires when two entries share a hash, so the cursor never drifts.
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, [api, loc]);
  const discard = () => {
    if (!pending) return;
    dirty.current = false;
    setRevision(value => value + 1);
    if (pending.delta !== undefined) history.go(pending.delta);
    else push(pending);
    setPending(null);
  };
  return {...loc, go, setDirty, revision, pending, discard, cancel: () => setPending(null)};
}
