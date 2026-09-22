import type {ApiEvent, EventKind} from '../../api/model';
import {eventKindLabels, eventSummary, localTime} from '../../api/selectors';
import {formatNumber, type Translator as LabelFn} from '../../i18n';

export function eventsView(
  events: ApiEvent[],
  selected: string,
  connected: boolean,
  available: boolean | null,
  limit: number,
  locale: string,
  t: LabelFn,
  advertised: EventKind[]
) {
  const kind = selected === 'without-runtime' || advertised.includes(selected as EventKind) ? selected : 'all';
  const shown = events
    .filter(event => kind === 'all' || (kind === 'without-runtime' ? event.event !== 'runtime.updated' : event.event === kind))
    .slice(0, limit);
  return {
    kind,
    rows: shown.map(event => {
      const summary = eventSummary(event, t);
      return {
        id: event.id,
        timestamp: localTime(event.data.observed_at, locale),
        timeTooltip: event.data.observed_at,
        kind: event.event,
        kindText: t(eventKindLabels[event.event]),
        summary: t(summary.key, summary.params)
      };
    }),
    kinds: [
      {id: 'without-runtime', label: t('event.withoutRuntime')},
      {id: 'all', label: t('event.allKinds')},
      ...advertised.map(id => ({id, label: t(eventKindLabels[id])}))
    ],
    // Before capabilities answer nothing has failed yet; a warning only fits a stream that was expected.
    status: {
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
