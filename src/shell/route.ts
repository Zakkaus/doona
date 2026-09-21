import {createContext, useCallback, useEffect, useRef, useState} from 'react';
import type {Go} from '../features/types';
import {shouldOpenSettings} from '../features/settings/settings';

type Route = {route: string; query: string};
export const DraftContext = createContext<{setDirty: (dirty: boolean) => void; revision: number}>({setDirty: () => {}, revision: 0});

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const i = h.indexOf('?');
  const route = {route: (i < 0 ? h : h.slice(0, i)) || 'activity', query: i < 0 ? '' : h.slice(i + 1)};
  return route.route === 'flows' ? legacyFlows(route.query) : route;
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

export function buildHash(route: string, query?: string): string {
  return '#/' + route + (query ? '?' + query : '');
}

export function updateRoute(current: Route, hash: string): Route {
  const next = parseHash(hash);
  return current.route === next.route && current.query === next.query ? current : next;
}

type PendingRoute = Route & {delta?: number};

function currentHash(api: string | null): string {
  if (shouldOpenSettings(api, location.hash)) history.replaceState(history.state, '', buildHash('settings'));
  else if (/^#\/?flows(\?|$)/.test(location.hash)) {
    const {route, query} = parseHash(location.hash);
    history.replaceState(history.state, '', buildHash(route, query));
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
  const push = useCallback((next: Route) => {
    history.pushState({doonaPosition: ++position.current}, '', buildHash(next.route, next.query));
    setLoc(next);
  }, []);
  const go = useCallback<Go>(
    (route, query = '') => {
      const next = updateRoute(loc, buildHash(route, query));
      if (next === loc) return;
      if (dirty.current) setPending(next);
      else push(next);
    },
    [loc, push]
  );
  useEffect(() => {
    const on = () => {
      if (restoring.current) {
        setPending(restoring.current);
        restoring.current = null;
        return;
      }
      const hash = currentHash(api);
      const nextPosition: number = history.state?.doonaPosition ?? position.current + 1;
      if (history.state?.doonaPosition === undefined) history.replaceState({...history.state, doonaPosition: nextPosition}, '', hash);
      const next = updateRoute(loc, hash);
      const delta = nextPosition - position.current;
      // A draft holds the page: step back to it and ask, then travel again on discard.
      if (next !== loc && dirty.current) {
        if (delta) {
          restoring.current = {...next, delta};
          history.go(-delta);
        } else {
          history.replaceState(history.state, '', buildHash(loc.route, loc.query));
          setPending(next);
        }
      } else {
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
