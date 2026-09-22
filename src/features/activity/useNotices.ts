import {useMemo, useSyncExternalStore} from 'react';
import {getApi} from '../../api';
import type {Api} from '../../api/api';
import type {ApiEvent} from '../../api/model';
import {EVENT_FEED_LIMIT} from '../../store';
import {useEvents} from '../../store/events';
import {createFeed} from '../../store/feed';
import {useT} from '../../i18n';
import {interestingNotice, noticeRows} from './view';

// Held per backend rather than per mount: the stream does not replay, so a fresh buffer on every return to the
// home page would forget the notices it had already shown.
const buffers = new WeakMap<Api, ReturnType<typeof createFeed<ApiEvent, Record<string, never>>>>();
function noticeBuffer(api: Api) {
  let buffer = buffers.get(api);
  if (!buffer) buffers.set(api, (buffer = createFeed<ApiEvent, Record<string, never>>(EVENT_FEED_LIMIT, {}, 'replace')));
  return buffer;
}

export function useNotices() {
  const t = useT();
  const buffer = noticeBuffer(getApi());
  const snapshot = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot);
  const feed = useEvents(event => {
    if (interestingNotice(event)) buffer.append(event);
  });
  const rows = useMemo(() => noticeRows(snapshot.records, t), [snapshot.records, t]);
  return {
    rows,
    total: snapshot.records.length,
    error: feed.error,
    loading: !feed.error && feed.available === null,
    empty: t(feed.available === false ? 'event.unavailable' : 'act.noIssues')
  };
}
