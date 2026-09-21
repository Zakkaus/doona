import {useMemo, useSyncExternalStore} from 'react';
import {getApi} from '../../api';
import type {ApiEvent} from '../../api/model';
import {routineGap} from '../../api/selectors';
import {EVENT_FEED_LIMIT} from '../../api/store';
import {useEvents} from '../../api/store/events';
import {createFeed} from '../../api/store/feed';
import {useT} from '../../i18n';
import {noticeRows} from './view';

export function useNotices() {
  const t = useT();
  const api = getApi();
  const buffer = useMemo(() => ({api, ...createFeed<ApiEvent, Record<string, never>>(EVENT_FEED_LIMIT, {}, 'replace')}), [api]);
  const snapshot = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot);
  const feed = useEvents(buffer.append);
  const rows = useMemo(
    () =>
      noticeRows(snapshot.records.filter(event => event.event !== 'runtime.updated' && event.event !== 'flow.updated' && !routineGap(event)).slice(0, 30), t),
    [snapshot.records, t]
  );
  return {rows, error: feed.error, loading: !feed.error && feed.available === null, empty: t(feed.available === false ? 'event.unavailable' : 'act.noIssues')};
}
