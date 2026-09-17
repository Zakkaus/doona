import {useEffect, useState} from 'react';
import type {Go} from '../features/types';
import {shouldOpenSettings} from '../features/settings/settings';

type Route = {route: string; query: string};

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

// A query string with some keys set or removed, for links that keep the rest of the page's state.
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

const go: Go = (route, query) => {
  location.hash = buildHash(route, query);
};

function currentHash(api: string | null): string {
  if (shouldOpenSettings(api, location.hash)) history.replaceState(null, '', buildHash('settings'));
  else if (/^#\/?flows(\?|$)/.test(location.hash)) {
    const {route, query} = parseHash(location.hash);
    history.replaceState(null, '', buildHash(route, query));
  }
  return location.hash;
}

export function useRoute(api: string | null) {
  const [loc, setLoc] = useState(() => parseHash(currentHash(api)));
  useEffect(() => {
    const on = () => {
      const hash = currentHash(api);
      setLoc(current => updateRoute(current, hash));
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, [api]);
  return {...loc, go};
}
