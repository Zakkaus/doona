import type {DnsCacheList} from '../../api/model';
import {formatNumber, type Translator} from '../../i18n';
import {parseU64, pctU64} from '../../api/u64';
import {ApiError} from '../../api/error';

// The cache card from one page of the listing: every page repeats the whole cache's usage and coverage. The entry count
// is the cache's only limit; a backend that does not report usage gets no capacity claim, only its entry count.
export function cacheCard(list: DnsCacheList | undefined, locale: string, t: Translator) {
  if (!list) return null;
  const {usage, coverage} = list;
  const count = (value: string) => {
    const n = parseU64(value);
    return n === null ? '—' : formatNumber(n, locale);
  };
  const pct = usage ? pctU64(usage.entries, usage.entry_capacity) : null;
  return {
    note: usage ? undefined : t('dns.chart.cacheNote', {n: list.total}),
    usage:
      usage && pct !== null
        ? {
            pct,
            // A cache in use never reads as 0%.
            value: pct > 0 && pct < 0.5 ? '<' + t('ui.percent', {n: 1}) : t('ui.percent', {n: Math.round(pct)}),
            facts: t('dns.chart.usageFacts', {entries: t('ui.fraction', {part: count(usage.entries), whole: count(usage.entry_capacity)})})
          }
        : null,
    coverage: t('dns.chart.coverage', {
      kinds: [coverage.positive && t('dns.chart.positive'), coverage.negative && t('dns.chart.negative')].filter(Boolean).join(t('ui.listSeparator')),
      persistent: t(coverage.persistent ? 'dns.chart.persistent' : 'dns.chart.memoryOnly')
    })
  };
}

// A 503 means the backend cannot list its cache right now, which outranks a reading kept from an earlier poll: that
// reading would still claim a fill level the backend no longer reports.
export function cacheCardState(listed: boolean, card: boolean, error: Error | null) {
  if (!listed) return 'unlisted' as const;
  if (error instanceof ApiError && error.status === 503) return 'unavailable' as const;
  return card ? ('ready' as const) : error ? ('error' as const) : ('loading' as const);
}
