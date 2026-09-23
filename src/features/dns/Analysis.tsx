import {useMemo} from 'react';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {DnsLogRecord} from '../../api/model';
import {millis} from '../../api/u64';
import {usePalette} from '../../ui/Charts';
import {Beeswarm, ChartCard, Waffle, type SwarmPoint} from '../../ui/charts';
import {dnsAnalysis, dnsOutcomes, type DnsOutcome} from './analysis';

const labels: Record<DnsOutcome, 'dns.outcome.cached' | 'dns.outcome.answered' | 'dns.outcome.nxdomain' | 'dns.outcome.failed'> = {
  cached: 'dns.outcome.cached',
  answered: 'dns.outcome.answered',
  nxdomain: 'dns.outcome.nxdomain',
  failed: 'dns.outcome.failed'
};

// How fast the loaded lookups were and how they ended, above the log table they come from.
export function DnsAnalysis({records}: {records: DnsLogRecord[] | undefined}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const a = useMemo(() => dnsAnalysis(records ?? []), [records]);
  // Answered takes a category colour, since info and positive are both blue-green in some palettes.
  const colors: Record<DnsOutcome, string> = {cached: p.positive, answered: p.cat[2], nxdomain: p.notice, failed: p.negative};
  const ms = (value: number) => t('ui.latency', {n: millis(value)});
  const percent = (share: number | null) => t('ui.percent', {n: share === null ? 0 : Math.round(share * 100)});
  const point = (sample: (typeof a.samples)[number]): SwarmPoint => ({
    id: sample.id,
    value: sample.value,
    color: colors[sample.outcome],
    title: t('dns.chart.point', {name: sample.name, latency: ms(sample.value), outcome: t(labels[sample.outcome])})
  });
  if (!records) return null;
  const answer =
    a.typical !== null && a.slowest !== null
      ? t('dns.chart.answer', {typical: ms(a.typical), slowest: ms(a.slowest), cache: percent(a.cacheRate)})
      : t('dns.chart.answerCacheOnly', {cache: percent(a.cacheRate)});
  return (
    <ChartCard id="dns-log" question={t('dns.chart.title')} answer={a.total < 5 ? t('dns.chart.tooFew') : answer} sample={t('dns.chart.sample', {n: a.total})}>
      {a.total >= 5 && (
        <div className="rp-chart-grid split">
          <section aria-labelledby="dns-speed">
            <h4 className="rp-chart-title" id="dns-speed">
              {t('dns.chart.speed', {n: a.samples.length})}
            </h4>
            <Beeswarm
              label={t('dns.chart.speed', {n: a.samples.length})}
              points={a.samples.map(point)}
              marks={
                a.typical !== null && a.slowest !== null
                  ? [
                      {value: a.typical, label: t('dns.chart.typical', {value: ms(a.typical)})},
                      {value: a.slowest, label: t('dns.chart.slowest', {value: ms(a.slowest)})}
                    ]
                  : []
              }
              rows={a.upstreams.map(row => ({
                id: row.upstream,
                label: row.upstream,
                detail: t('dns.chart.upstream', {n: row.samples.length, median: ms(row.median)}),
                points: row.samples.map(point),
                mark: row.median
              }))}
              fmt={ms}
            />
          </section>
          <section aria-labelledby="dns-outcomes">
            <h4 className="rp-chart-title" id="dns-outcomes">
              {t('dns.chart.outcomes')}
            </h4>
            <Waffle
              label={t('dns.chart.outcomes')}
              shares={dnsOutcomes.map(outcome => ({
                id: outcome,
                label: t(labels[outcome]),
                count: a.counts[outcome],
                color: colors[outcome],
                text: `${formatNumber(a.counts[outcome], locale)} · ${percent(a.total ? a.counts[outcome] / a.total : 0)}`
              }))}
            />
          </section>
        </div>
      )}
    </ChartCard>
  );
}
