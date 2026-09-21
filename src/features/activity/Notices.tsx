import {useRef, useState} from 'react';
import {getApi} from '../../api';
import type {ApiEvent} from '../../api/model';
import {eventSummary, routineGap} from '../../api/selectors';
import {EVENT_FEED_LIMIT} from '../../api/store';
import {useEvents} from '../../api/store/events';
import {useT} from '../../i18n';
import {buildHash} from '../../shell/route';
import {Empty, ErrorMessage, Light, Link, Loading} from '../../ui/ui';

// The subscription lives in the page from its first render, so nothing arriving while the page still loads is lost.
export function useNotices() {
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
  return {feed, events};
}
export function Notices({feed, events}: ReturnType<typeof useNotices>) {
  const t = useT();
  return (
    <section className="rp-card" aria-label={t('act.issues')}>
      <div className="rp-row">
        <div className="rp-cluster">
          <h3 className="rp-h3">{t('act.issues')}</h3>
          {events.length > 0 && <span className="rp-label">{events.length}</span>}
        </div>
        <Link appearance="button" className="quiet sm" href={buildHash('events')}>
          {t('act.viewAll')}
        </Link>
      </div>
      {feed.error && <ErrorMessage error={feed.error} />}
      {!feed.error && feed.available === null ? (
        <Loading />
      ) : events.length === 0 ? (
        <Empty>{t(feed.available === false ? 'event.unavailable' : 'act.noIssues')}</Empty>
      ) : (
        <div className="rp-list rp-feed" role="list">
          {events.map(event => {
            const summary = eventSummary(event, t);
            return (
              <div key={event.id} role="listitem" className="rp-row">
                <Light small tone={event.event === 'flow.gap' ? 'warn' : 'info'}>
                  {t(event.event === 'flow.gap' ? 'ui.warning' : 'ui.notice')}
                </Light>
                <span className="rp-note rp-grow">
                  {event.event} · {t(summary.key, summary.params)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
