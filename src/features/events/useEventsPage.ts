import {useMemo, useState} from 'react';
import {EVENT_FEED_LIMIT, historyLost, refetchAll, reopenEvents, useCapabilities, useEventFeed} from '../../store';
import {getApi} from '../../api';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, useLinked} from '../../ui/ui';
import {eventsExport, eventsView} from './view';

export function useEventsPage() {
  const api = getApi();
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const kinds = capabilities.data?.resources.events.kinds;
  const [kind, setKind] = useState('without-runtime');
  // Heartbeats are only fetched for a view that can show them; an unadvertised kind falls back to all.
  const single = kind !== 'all' && kind !== 'runtime.updated' && (kinds as string[] | undefined)?.includes(kind);
  const feed = useEventFeed(kind !== 'without-runtime' && !single);
  const view = useMemo(
    () => eventsView(feed.events, kind, feed.connected, feed.available, EVENT_FEED_LIMIT, locale, t, kinds ?? [], !!feed.error, historyLost),
    [feed.events, kind, feed.connected, feed.available, feed.error, locale, t, kinds]
  );
  useLinked(view.kind, setKind);
  return {
    ...view,
    setKind,
    cursor: feed.cursor,
    error: feed.error,
    retry: () => void refetchAll().then(() => reopenEvents(api)),
    loading: !feed.error && !feed.connected && feed.available !== false && !feed.events.length,
    export: () => downloadFile(exportName('doona-events', 'json'), eventsExport(view.shown), 'application/json')
  };
}
