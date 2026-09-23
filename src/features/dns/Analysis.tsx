import {useMemo} from 'react';
import {LOCALE, useLang, useT} from '../../i18n';
import {useDnsLog} from '../../store';
import {Empty, ErrorMessage, Loading} from '../../ui/ui';
import type {DnsLogRecord} from '../../api/model';
import {millis} from '../../api/u64';
import {usePalette} from '../../ui/Charts';
import {BarList, Beeswarm, ChartCard, Heatmap, ShareBar, Waffle, type ChartFact, type SwarmPoint} from '../../ui/charts';
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
  // A share is never rounded to 0% or 100% when that would contradict a cell the waffle draws or leaves out.
  const shareText = (count: number) => {
    const share = a.total ? count / a.total : 0;
    return count > 0 && share < 0.005 ? '<' + t('ui.percent', {n: 1}) : count < a.total && share > 0.995 ? '>' + t('ui.percent', {n: 99}) : percent(share);
  };
  const point = (sample: (typeof a.samples)[number]): SwarmPoint => ({
    id: sample.id,
    value: sample.value,
    color: colors[sample.outcome],
    lines: [sample.name, ms(sample.value), t(labels[sample.outcome])]
  });
  if (!records) return null;
  const dash = (value: number | null, format: (value: number) => string) => (value === null ? '—' : format(value));
  const clock = new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const span = (start: number) => `${clock.format(start)}–${clock.format(start + a.timeline.width)}`;
  const facts: ChartFact[] =
    a.total < 5
      ? []
      : [
          {label: t('dns.chart.median'), value: dash(a.typical, ms)},
          {label: t('dns.chart.p95'), value: dash(a.slowest, ms)},
          {label: t('dns.chart.cacheRate'), value: percent(a.cacheRate)},
          {label: t('dns.chart.failureRate'), value: percent(a.failureRate), tone: a.counts.failed ? 'negative' : undefined}
        ];
  const sample = a.total < 5 ? t('dns.chart.tooFew') : t('dns.chart.sample', {n: a.total, uncached: a.uncached, upstream: a.samples.length});
  return (
    <ChartCard title={t('dns.chart.title')} facts={facts} sample={sample}>
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
            <div className="rp-legend">
              {(['answered', 'nxdomain', 'failed'] as const).map(outcome => (
                <span key={outcome} className="it">
                  <i className="sw" style={{background: colors[outcome]}} />
                  {t(labels[outcome])}
                </span>
              ))}
              <span className="it">
                <i className="rp-median-key" aria-hidden="true" />
                {t('dns.chart.medianKey')}
              </span>
            </div>
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
                text: t('dns.chart.share', {n: a.counts[outcome], share: shareText(a.counts[outcome])})
              }))}
            />
          </section>
        </div>
      )}
      {a.total >= 5 && (
        <>
          <div className="rp-chart-grid halves">
            <section aria-labelledby="dns-domains">
              <h4 className="rp-chart-title" id="dns-domains">
                {t('dns.chart.domains')}
              </h4>
              <BarList
                label={t('dns.chart.domains')}
                color={p.accent}
                items={a.domains.top.map(item => ({id: item.key, label: item.key, count: item.count, text: t('dns.chart.count', {n: item.count})}))}
                rest={a.domains.rest ? t('dns.chart.rest', {n: a.domains.rest}) : undefined}
              />
            </section>
            <section aria-labelledby="dns-clients">
              <h4 className="rp-chart-title" id="dns-clients">
                {t('dns.chart.clients')}
              </h4>
              <BarList
                label={t('dns.chart.clients')}
                color={p.cat[3]}
                items={a.clients.top.map(item => ({
                  id: item.key ?? '',
                  label: item.key ?? t('dns.chart.resolver'),
                  count: item.count,
                  text: t('dns.chart.count', {n: item.count})
                }))}
                rest={a.clients.rest ? t('dns.chart.rest', {n: a.clients.rest}) : undefined}
              />
            </section>
          </div>
          <div className="rp-chart-grid halves">
            <section aria-labelledby="dns-types">
              <h4 className="rp-chart-title" id="dns-types">
                {t('dns.chart.types')}
              </h4>
              <ShareBar
                label={t('dns.chart.types')}
                segments={a.types.top.map((item, i) => ({
                  id: item.key,
                  label: item.key,
                  count: item.count,
                  color: p.cat[i % p.cat.length],
                  text: t('dns.chart.share', {n: item.count, share: shareText(item.count)})
                }))}
              />
            </section>
            <section aria-labelledby="dns-routes">
              <h4 className="rp-chart-title" id="dns-routes">
                {t('dns.chart.routes')}
              </h4>
              <BarList
                label={t('dns.chart.routes')}
                color={p.cat[2]}
                items={a.routes.top.map(item => ({
                  id: item.key,
                  label: item.key === 'default' ? t('dns.chart.routeDefault') : item.key === 'forced' ? t('dns.chart.routeForced') : item.key,
                  count: item.count,
                  text: t('dns.chart.count', {n: item.count})
                }))}
                rest={a.routes.rest ? t('dns.chart.rest', {n: a.routes.rest}) : undefined}
              />
            </section>
          </div>
          <section aria-labelledby="dns-time">
            <h4 className="rp-chart-title" id="dns-time">
              {t('dns.chart.overTime')}
            </h4>
            <Heatmap
              label={t('dns.chart.overTime')}
              columns={a.timeline.buckets.map(start => clock.format(start))}
              rows={dnsOutcomes.map(outcome => ({
                id: outcome,
                label: t(labels[outcome]),
                color: colors[outcome],
                counts: a.timeline.counts[outcome],
                titles: a.timeline.counts[outcome].map((n, i) => t('dns.chart.cell', {time: span(a.timeline.buckets[i]), outcome: t(labels[outcome]), n}))
              }))}
            />
          </section>
        </>
      )}
    </ChartCard>
  );
}

// The statistics tab: the latest page of the log, unfiltered, the same records the log tab opens with.
export function DnsStats({enabled}: {enabled: boolean | undefined}) {
  const t = useT();
  const log = useDnsLog({}, enabled === true);
  if (enabled === false) return <Empty>{t('dns.logUnavailable')}</Empty>;
  // Not known yet, or capabilities failed: the page says why above the tabs.
  if (enabled === undefined) return null;
  if (log.error && !log.data) return <ErrorMessage error={log.error} onRetry={log.refetch} />;
  if (!log.data) return <Loading />;
  return <DnsAnalysis records={log.data.records} />;
}
