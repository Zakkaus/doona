import {useCallback, useMemo, useState} from 'react';
import {poll, useCapabilities, useConnections} from '../../store';
import {LOCALE, useLang, useT} from '../../i18n';
import {usePalette} from '../../ui/charts';
import {activityRanking} from './view';

// The poll runs every 20 seconds while the card is near the viewport; off screen it is paused and keeps its last list.
export function useRankingCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const [by, setBy] = useState('dev');
  const available = useCapabilities().data?.resources.connections.available;
  const [near, setNear] = useState(false);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const observer = new IntersectionObserver(entries => setNear(entries.at(-1)!.isIntersecting), {rootMargin: '400px'});
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Paused only once it has a list to keep showing; before that it loads wherever it is.
  const [loaded, setLoaded] = useState(false);
  const connections = useConnections(undefined, available === true, !near && loaded, poll.summary);
  if (connections.data && !loaded) setLoaded(true);
  const rows = useMemo(() => activityRanking(connections.data, by, p, locale, t), [connections.data, by, p, locale, t]);
  const state = connections.data ? (rows.length ? 'ready' : 'empty') : connections.error ? 'error' : available === true ? 'loading' : 'unavailable';
  return {
    ref,
    by,
    setBy,
    rows,
    state,
    error: connections.data ? undefined : connections.error,
    retry: connections.refetch,
    truncated: !!connections.data?.truncated
  };
}
