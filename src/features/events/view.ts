import type {ApiEvent} from '../../api/model';
import {eventKindLabels, eventKinds, eventSummary, localTime} from '../../api/selectors';
import {formatNumber, type Translator as LabelFn} from '../../i18n';

export function eventsView(events: ApiEvent[], kind: string, connected: boolean, available: boolean | null, limit: number, locale: string, t: LabelFn) {
  const shown = events.filter(event => kind === 'all' || event.event === kind);
  return {
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
    kinds: [{id: 'all', label: t('event.allKinds')}, ...eventKinds.map(id => ({id, label: t(eventKindLabels[id])}))],
    status: {
      tone: connected ? ('ok' as const) : ('warn' as const),
      text: t(available === false ? 'event.unavailable' : connected ? 'event.connected' : 'event.reconnecting')
    },
    limitText: t('event.limit', {n: formatNumber(limit, locale)}),
    exportContent: JSON.stringify(shown, null, 2) + '\n'
  };
}
