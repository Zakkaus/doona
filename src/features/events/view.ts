import type {ApiEvent, EventKind} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {eventKindLabels, eventSummary} from '../../api/selectors';
import {localTime} from '../../i18n/format';
import type {Key, Translator as LabelFn} from '../../i18n';
import type {Help} from '../../ui/ui';

type EventRow = {id: string; timestamp: string; iso: string; kind: ApiEvent['event']; kindText: string; summary: string; help?: Help};
// The gaps that lose flow records under load are explained: whether anything needs doing depends on the reason.
const gapHelp: Record<string, [Key, Key]> = {
  buffer_overflow: ['event.gap.overflow', 'event.gapHelp.overflow'],
  evicted: ['event.gap.evicted', 'event.gapHelp.evicted']
};
export function eventHelp(event: ApiEvent, t: LabelFn): Help | undefined {
  const keys = event.event === 'flow.gap' && Object.hasOwn(gapHelp, event.data.reason) ? gapHelp[event.data.reason] : undefined;
  return keys && {title: t(keys[0]), text: t(keys[1])};
}
// An event never changes once received, so its row is built once per locale and the table sees the same object.
const rows = new WeakMap<ApiEvent, {locale: string; row: EventRow}>();
function eventRow(event: ApiEvent, locale: string, t: LabelFn, lost: boolean): EventRow {
  const hit = rows.get(event);
  if (hit && hit.locale === locale) return hit.row;
  const summary = lost ? {key: 'event.lostHistory' as const} : eventSummary(event, t);
  const row = {
    id: event.id,
    timestamp: localTime(event.data.observed_at, locale),
    iso: event.data.observed_at,
    kind: event.event,
    kindText: enumLabel(eventKindLabels, event.event, t),
    summary: t(summary.key, summary.params),
    help: lost ? undefined : eventHelp(event, t)
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
  failed = false,
  lost: (event: ApiEvent) => boolean = () => false
) {
  const kind = selected === 'without-runtime' || advertised.includes(selected as EventKind) ? selected : 'all';
  const shown = events
    .filter(event => kind === 'all' || (kind === 'without-runtime' ? event.event !== 'runtime.updated' : event.event === kind))
    .slice(0, limit);
  return {
    kind,
    rows: shown.map(event => eventRow(event, locale, t, lost(event))),
    kinds: [
      {id: 'without-runtime', label: t('event.withoutRuntime')},
      {id: 'all', label: t('event.allKinds')},
      ...advertised.map(id => ({id, label: enumLabel(eventKindLabels, id, t)}))
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
    limitText: t('event.limit', {n: limit}),
    shown
  };
}

export function eventsExport(events: ApiEvent[]) {
  return JSON.stringify(events, null, 2) + '\n';
}
