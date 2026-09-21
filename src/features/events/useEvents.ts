import {useMemo, useState} from 'react';
import {EVENT_FEED_LIMIT, useEventFeed} from '../../api/store';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName} from '../../ui/ui';
import {eventsView} from './view';

export function useEvents() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [kind, setKind] = useState('all');
  const feed = useEventFeed();
  const view = useMemo(
    () => eventsView(feed.events, kind, feed.connected, feed.available, EVENT_FEED_LIMIT, locale, t),
    [feed.events, kind, feed.connected, feed.available, locale, t]
  );
  return {
    ...view,
    kind,
    setKind,
    cursor: feed.cursor,
    error: feed.error,
    loading: !feed.error && !feed.connected && feed.available !== false && !feed.events.length,
    export: () => downloadFile(exportName('doona-events', 'json'), view.exportContent, 'application/json')
  };
}
