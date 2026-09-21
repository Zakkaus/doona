import {useMemo, useRef, useState} from 'react';
import {getApi} from '../../api';
import type {ApiEvent} from '../../api/model';
import {routineGap} from '../../api/selectors';
import {EVENT_FEED_LIMIT} from '../../api/store';
import {useEvents} from '../../api/store/events';
import {useT} from '../../i18n';
import {noticeRows} from './view';

export function useNotices() {
  const t = useT();
  const api = getApi();
  const [previousApi, setPreviousApi] = useState(api);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const ring = useRef({api, entries: new Map<string, ApiEvent | null>(), shown: events});
  if (previousApi !== api) {
    setPreviousApi(api);
    setEvents([]);
  }
  const feed = useEvents(event => {
    if (ring.current.api !== api) ring.current = {api, entries: new Map(), shown: []};
    const {entries, shown} = ring.current;
    const notice = event.event !== 'runtime.updated' && event.event !== 'flow.updated' && !routineGap(event);
    const replaced = entries.get(event.id);
    entries.delete(event.id);
    entries.set(event.id, notice ? event : null);
    let evicted: ApiEvent | null | undefined;
    if (entries.size > EVENT_FEED_LIMIT) {
      const oldest = entries.keys().next().value!;
      evicted = entries.get(oldest);
      entries.delete(oldest);
    }
    // Hidden ticks still age notices out of the shared feed's 200-event window.
    if (!notice && !replaced && !evicted) return;
    const next = [...entries.values()]
      .filter((item): item is ApiEvent => item !== null)
      .reverse()
      .slice(0, 30);
    if (next.length === shown.length && next.every((item, i) => item === shown[i])) return;
    ring.current.shown = next;
    setEvents(next);
  });
  const rows = useMemo(() => noticeRows(events, t), [events, t]);
  return {rows, error: feed.error, loading: !feed.error && feed.available === null, empty: t(feed.available === false ? 'event.unavailable' : 'act.noIssues')};
}
