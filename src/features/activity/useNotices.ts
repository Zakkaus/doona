import {useMemo, useSyncExternalStore} from 'react';
import {getApi} from '../../api';
import type {ApiEvent} from '../../api/model';
import {EVENT_FEED_LIMIT} from '../../store';
import {useEvents} from '../../store/events';
import {createFeed} from '../../store/feed';
import {useT} from '../../i18n';
import {interestingNotice, noticeRows} from './view';

export function useNotices() {
  const t = useT();
  const api = getApi();
  const buffer = useMemo(() => ({api, ...createFeed<ApiEvent, Record<string, never>>(EVENT_FEED_LIMIT, {}, 'replace')}), [api]);
  const snapshot = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot);
  const feed = useEvents(event => {
    if (interestingNotice(event)) buffer.append(event);
  });
  const rows = useMemo(() => noticeRows(snapshot.records.slice(0, 30), t), [snapshot.records, t]);
  return {rows, error: feed.error, loading: !feed.error && feed.available === null, empty: t(feed.available === false ? 'event.unavailable' : 'act.noIssues')};
}
