import {useEffect, useMemo, useState} from 'react';
import type {Go} from './pages/types';

type Route = {route: string, query: string};

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, ''); const i = h.indexOf('?');
  return {route: (i < 0 ? h : h.slice(0, i)) || 'activity', query: i < 0 ? '' : h.slice(i + 1)};
}

export function buildHash(route: string, query?: string): string {
  return '#/' + route + (query ? '?' + query : '');
}

export function updateRoute(current: Route, hash: string): Route {
  const next = parseHash(hash);
  return current.route === next.route && current.query === next.query ? current : next;
}

const go: Go = (route, query) => { location.hash = buildHash(route, query); };

export function useRoute() {
  const [loc, setLoc] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setLoc(current => updateRoute(current, location.hash));
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on);
  }, []);
  const params = useMemo(() => new URLSearchParams(loc.query), [loc.query]);
  return {...loc, params, go};
}
