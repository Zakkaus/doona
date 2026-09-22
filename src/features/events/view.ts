import type {ApiEvent, EventKind} from '../../api/model';
import {eventKindLabels, eventSummary, localTime} from '../../api/selectors';
import {formatNumber, type Translator as LabelFn} from '../../i18n';

type EventRow = {id: string; timestamp: string; timeTooltip: string; kind: ApiEvent['event']; kindText: string; summary: string};
// An event never changes once received, so its row is built once per locale and the table sees the same object.
const rows = new WeakMap<ApiEvent, {locale: string; row: EventRow}>();
function eventRow(event: ApiEvent, locale: string, t: LabelFn): EventRow {
  const hit = rows.get(event);
  if (hit && hit.locale === locale) return hit.row;
  const summary = eventSummary(event, t);
  const row = {
    id: event.id,
    timestamp: localTime(event.data.observed_at, locale),
    timeTooltip: event.data.observed_at,
    kind: event.event,
    kindText: t(eventKindLabels[event.event]),
    summary: t(summary.key, summary.params)
  };
  rows.set(event, {locale, row});
  return row;
}

export function eventsView(
  events: ApiEvent[],
  selected: string,
  connected: boolean,
  available: boolean | null,
  limit: number,
  locale: string,
  t: LabelFn,
  advertised: EventKind[],
  failed = false
) {
  const kind = selected === 'without-runtime' || advertised.includes(selected as EventKind) ? selected : 'all';
  const shown = events
    .filter(event => kind === 'all' || (kind === 'without-runtime' ? event.event !== 'runtime.updated' : event.event === kind))
    .slice(0, limit);
  return {
    kind,
    rows: shown.map(event => eventRow(event, locale, t)),
    kinds: [
      {id: 'without-runtime', label: t('event.withoutRuntime')},
      {id: 'all', label: t('event.allKinds')},
      ...advertised.map(id => ({id, label: t(eventKindLabels[id])}))
    ],
    // Before capabilities answer nothing has failed yet; a warning only fits a stream that was expected. A failed
    // stream waits for a retry, so it is not reconnecting.
    status:
      failed && available !== false
        ? {tone: 'err' as const, text: t('event.disconnected')}
        : {
            tone: connected ? ('ok' as const) : available === null ? ('muted' as const) : ('warn' as const),
            text: t(available === false ? 'event.unavailable' : connected ? 'event.connected' : available === null ? 'ui.loading' : 'event.reconnecting')
          },
    limitText: t('event.limit', {n: formatNumber(limit, locale)}),
    shown
  };
}

export function eventsExport(events: ApiEvent[]) {
  return JSON.stringify(events, null, 2) + '\n';
}
