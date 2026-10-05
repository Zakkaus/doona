import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {dropDrafts} from './draft';
import {shouldOpenSettings} from './preferences';
import {defaultRoute, hasRoute, isRoutePath, type Go, type RoutePath} from './routes';

type Route = {route: RoutePath; query: string};

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const i = h.indexOf('?');
  const route = {route: (i < 0 ? h : h.slice(0, i)) || defaultRoute, query: i < 0 ? '' : h.slice(i + 1)};
  const moved = movedRoute(route.route, route.query);
  return moved ?? {route: isRoutePath(route.route) ? route.route : defaultRoute, query: route.query};
}
// Old links keep working. The flow map and records moved from the rules page to their own page. The map was the rules
// page's default tab once, so its links from then carry a pinned path or grouping but no tab. The flows page before
// that opened the records for a selected flow or connection.
function movedRoute(route: string, query: string): Route | null {
  const params = new URLSearchParams(query);
  const tab = params.get('tab');
  if (route === 'rules' && (tab === 'map' || tab === 'flows' || (tab === null && (params.has('path') || params.has('by'))))) {
    params.set('tab', tab === 'flows' ? 'records' : 'map');
  } else if (route === 'flows' && tab === null && (params.has('id') || params.has('connection_id'))) {
    params.set('tab', 'records');
  } else if (route === 'settings' && params.get('card') === 'global') {
    // The persistent global settings moved from a settings card to the configuration page's global tab.
    params.delete('card');
    params.set('tab', 'global');
    return {route: 'config', query: params.toString()};
  } else return null;
  return {route: 'flows', query: params.toString()};
}

export function within(query: string, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(query);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next.toString();
}

// A fixed default tab stays out of the address, so a link without one keeps following the page's default. A default
// that depends on data or on the link (null) is always written: otherwise a poll or a cleared filter that changes the
// default would move the page to another tab.
export function tabQuery(query: string, next: string, fallback: string | null): string {
  return within(query, {tab: next === fallback ? null : next});
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

type PendingRoute = Route & {delta?: number; replace?: boolean};

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

// Firefox drops an entry's state on a navigation to its own address, so it can be null on any render.
export function historyPosition(fallback = 0): number {
  const value: unknown = history.state?.doonaPosition;
  return typeof value === 'number' ? value : fallback;
}

function currentHash(api: string | null, startPage: RoutePath = defaultRoute): string {
  if (shouldOpenSettings(api, location.hash)) history.replaceState(history.state, '', buildHash('settings'));
  else {
    const {route, query} = hasRoute(location.hash) ? parseHash(location.hash) : {route: startPage, query: ''};
    const canonical = buildHash(route, query);
    if (location.hash !== canonical) history.replaceState(history.state, '', canonical);
  }
  return location.hash;
}

// Rewrites the current address in place without asking about unsaved drafts, for a page that corrects its own
// address, such as dropping a pairing token. The shell's route follows, so a later draft restore cannot write the old
// address back.
let replaceShellRoute: ((next: Route) => void) | null = null;
export function replaceRoute(route: RoutePath, query = '') {
  if (replaceShellRoute) replaceShellRoute({route, query});
  else history.replaceState(history.state, '', buildHash(route, query));
}

export function useRoute(api: string | null, startPage: RoutePath = defaultRoute) {
  const [loc, setLoc] = useState(() => {
    const hash = currentHash(api, startPage);
    history.replaceState({...history.state, doonaPosition: historyPosition()}, '', hash);
    return parseHash(hash);
  });
  const position = useRef(historyPosition());
  const restoring = useRef<PendingRoute | null>(null);
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<PendingRoute | null>(null);
  // An action that must not land before the drafts are answered for, as a profile switch or a sign-out.
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const ask = useCallback((action: () => void) => setLeaving(() => action), []);
  // The route the shell last accepted, set with each setLoc rather than on commit, so a route a page replaced in the
  // same commit counts before it renders. `go` reads it to keep one identity across navigations, so memoised pages and
  // tiles are not re-rendered by the callback alone.
  const current = useRef(loc);
  const push = useCallback((next: Route, replace = false) => {
    if (replace) history.replaceState({...history.state, doonaPosition: position.current}, '', buildHash(next.route, next.query));
    else history.pushState({doonaPosition: ++position.current}, '', buildHash(next.route, next.query));
    current.current = next;
    setLoc(next);
  }, []);
  // A layout effect, so it is in place before a page's own effects run on the first render.
  useLayoutEffect(() => {
    replaceShellRoute = next => push(updateRoute(current.current, buildHash(next.route, next.query)), true);
    return () => {
      replaceShellRoute = null;
    };
  }, [push]);
  const go = useCallback<Go>(
    (route, query = '', options) => {
      const next = updateRoute(current.current, buildHash(route, query));
      if (next === current.current) return;
      if (dirty.current) setPending({...next, replace: options?.replace});
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
      const next = updateRoute(loc, hash);
      // An entry without a position is a new hash the browser pushed, unless it is the current address again, which
      // replaces the entry in place (and is where Firefox drops its state).
      const nextPosition = historyPosition(next === loc ? position.current : position.current + 1);
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
        current.current = next;
        setLoc(next);
      }
    };
    // popstate, not hashchange: it also fires when two entries share a hash, so the cursor never drifts.
    addEventListener('popstate', on);
    // The first render read the address before this listener existed, so a navigation in between fired no event. The
    // address is compared with the accepted route, not `loc`: a page that replaced it in this commit is not navigating.
    if (!restoring.current && updateRoute(current.current, location.hash) !== current.current) on();
    return () => removeEventListener('popstate', on);
  }, [api, loc]);
  const discard = () => {
    if (!pending && !leaving) return;
    dropDrafts(setDirty);
    dirty.current = false;
    setRevision(value => value + 1);
    if (!pending) {
      setLeaving(null);
      leaving?.();
      return;
    }
    if (pending.delta !== undefined) history.go(pending.delta);
    else push(pending, pending.replace);
    setPending(null);
  };
  return {
    ...loc,
    go,
    setDirty,
    ask,
    revision,
    confirming: pending !== null || leaving !== null,
    discard,
    cancel: () => {
      setPending(null);
      setLeaving(null);
    }
  };
}
