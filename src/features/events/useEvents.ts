import {useMemo, useState} from 'react';
import {EVENT_FEED_LIMIT, refetchAll, useCapabilities, useEventFeed} from '../../store';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, useLinked} from '../../ui/ui';
import {eventsExport, eventsView} from './view';

export function useEvents() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const kinds = capabilities.data?.resources.events.kinds;
  const [kind, setKind] = useState('without-runtime');
  const feed = useEventFeed(kind !== 'without-runtime');
  const view = useMemo(
    () => eventsView(feed.events, kind, feed.connected, feed.available, EVENT_FEED_LIMIT, locale, t, kinds ?? []),
    [feed.events, kind, feed.connected, feed.available, locale, t, kinds]
  );
  useLinked(view.kind, setKind);
  return {
    ...view,
    setKind,
    cursor: feed.cursor,
    error: feed.error,
    retry: () => void refetchAll(),
    loading: !feed.error && !feed.connected && feed.available !== false && !feed.events.length,
    export: () => downloadFile(exportName('doona-events', 'json'), eventsExport(view.shown), 'application/json')
  };
}
