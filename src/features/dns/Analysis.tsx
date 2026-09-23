import {formatLatency} from '../../i18n/format';
import {useMemo, useState} from 'react';
import {useT} from '../../i18n';
import {useDnsCacheCard, useDnsStatsTab} from './useDns';
import {Card, Bar, Empty, ErrorMessage, Loading, Segmented} from '../../ui/ui';
import type {DnsLogRecord} from '../../api/model';
import {usePalette, Beeswarm, FactStrip, LegendItem, Waffle, type ChartFact, type SwarmPoint} from '../../ui/charts';
import {dnsAnalysis, dnsOutcomes, type DnsAnalysis as Analysis, type DnsOutcome} from './stats';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import Clock from '../../ui/icons/Clock';
import Data from '../../ui/icons/Data';
import SpeedFast from '../../ui/icons/SpeedFast';

const labels: Record<DnsOutcome, 'dns.outcome.cached' | 'dns.outcome.answered' | 'dns.outcome.nxdomain' | 'dns.outcome.failed'> = {
  cached: 'dns.outcome.cached',
  answered: 'dns.outcome.answered',
  nxdomain: 'dns.outcome.nxdomain',
  failed: 'dns.outcome.failed'
};

export function DnsStats({enabled}: {enabled: boolean | undefined}) {
  const t = useT();
  const {log, cacheListed} = useDnsStatsTab(enabled);
  if (enabled === false) return <Empty>{t('dns.logUnavailable')}</Empty>;
  // Not known yet, or capabilities failed: the page says why above the tabs.
  if (enabled === undefined) return null;
  if (log.error && !log.data) return <ErrorMessage error={log.error} onRetry={log.refetch} />;
  if (!log.data) return <Loading />;
  return <DnsAnalysis records={log.data.records} cacheListed={cacheListed} />;
}

function DnsAnalysis({records, cacheListed}: {records: DnsLogRecord[]; cacheListed: boolean}) {
  const t = useT();
  const p = usePalette();
  const a = useMemo(() => dnsAnalysis(records), [records]);
  // Answered takes a category colour, since info and positive are both blue-green in some palettes.
  const colors: Record<DnsOutcome, string> = {cached: p.positive, answered: p.cat[2], nxdomain: p.notice, failed: p.negative};
  const percent = (share: number | null) => t('ui.percent', {n: share === null ? 0 : Math.round(share * 100)});
  // A share is never rounded to 0% or 100% when that would contradict a cell the waffle draws or leaves out.
  const shareText = (count: number, total: number) => {
    const share = total ? count / total : 0;
    return count > 0 && share < 0.005 ? '<' + t('ui.percent', {n: 1}) : count < total && share > 0.995 ? '>' + t('ui.percent', {n: 99}) : percent(share);
  };
  const point = (sample: (typeof a.samples)[number]): SwarmPoint => ({
    id: sample.id,
    value: sample.value,
    color: colors[sample.outcome],
    lines: [sample.name, formatLatency(sample.value, t), t(labels[sample.outcome])]
  });
  // Too few records to chart are said inside each chart they feed; the cache card does not depend on them.
  const sparse = a.total < 5;
  const tooFew = <Empty>{t('dns.chart.tooFew')}</Empty>;
  const facts: ChartFact[] = [
    {label: t('dns.chart.median'), value: formatLatency(a.typical, t), icon: <SpeedFast />, tint: 'c1'},
    {label: t('dns.chart.p95'), value: formatLatency(a.slowest, t), icon: <Clock />, tint: 'c4'},
    {label: t('dns.chart.cacheRate'), value: percent(a.cacheRate), icon: <Data />, tint: 'c2'},
    {label: t('dns.chart.failureRate'), value: percent(a.failureRate), icon: <AlertTriangle />, tint: 'c5', tone: a.counts.failed ? 'negative' : undefined}
  ];
  return (
    <div className="rp-chart-page">
      {!sparse && <FactStrip facts={facts} />}
      <div className="rp-g21">
        <Card
          title={t('dns.chart.speed', {n: a.samples.length})}
          note={sparse ? undefined : t('dns.chart.sample', {n: a.total, uncached: a.uncached, upstream: a.samples.length})}
        >
          {sparse ? (
            tooFew
          ) : (
            <>
              <Beeswarm
                label={t('dns.chart.speed', {n: a.samples.length})}
                points={a.samples.map(point)}
                marks={
                  a.typical !== null && a.slowest !== null
                    ? [
                        {value: a.typical, label: t('dns.chart.typical', {value: formatLatency(a.typical, t)})},
                        {value: a.slowest, label: t('dns.chart.slowest', {value: formatLatency(a.slowest, t)})}
                      ]
                    : []
                }
                rows={a.upstreams.map(row => ({
                  id: row.upstream,
                  label: row.upstream,
                  detail: t('dns.chart.upstream', {n: row.samples.length, median: formatLatency(row.median, t)}),
                  points: row.samples.map(point),
                  mark: row.median
                }))}
                fmt={value => formatLatency(value, t)}
              />
              <div className="rp-legend">
                {(['answered', 'nxdomain', 'failed'] as const).map(outcome => (
                  <LegendItem key={outcome} swatch={colors[outcome]} label={t(labels[outcome])} />
                ))}
                <LegendItem swatch={<i className="rp-median-key" aria-hidden="true" />} label={t('dns.chart.medianKey')} />
              </div>
            </>
          )}
        </Card>
        <Card title={t('dns.chart.outcomes')}>
          {sparse ? (
            tooFew
          ) : (
            <Waffle
              label={t('dns.chart.outcomes')}
              shares={dnsOutcomes.map(outcome => ({
                id: outcome,
                label: t(labels[outcome]),
                count: a.counts[outcome],
                color: colors[outcome],
                text: t('dns.chart.share', {n: a.counts[outcome], share: shareText(a.counts[outcome], a.total)})
              }))}
            />
          )}
        </Card>
      </div>
      <div className="rp-g21">
        <RankingCard analysis={a} sparse={sparse} />
        <CacheCard listed={cacheListed} />
      </div>
    </div>
  );
}

// How full the cache is, from the usage the backend reports, and what kinds of answer it keeps.
function CacheCard({listed}: {listed: boolean}) {
  const t = useT();
  const p = usePalette();
  const {ref, ...vm} = useDnsCacheCard(listed);
  return (
    <Card ref={ref} title={t('dns.chart.cache')} note={vm.state === 'ready' ? vm.card?.note : undefined}>
      {vm.state === 'unlisted' ? (
        <Empty>{t('dns.cacheUnavailable')}</Empty>
      ) : vm.state === 'unavailable' ? (
        <Empty>{t('dns.cacheBusy')}</Empty>
      ) : vm.state === 'error' ? (
        <ErrorMessage error={vm.error} onRetry={vm.retry} />
      ) : !vm.card ? (
        <Loading />
      ) : (
        <>
          {vm.card.usage && (
            <div className="rp-form">
              <Bar label={t('dns.chart.usage')} value={vm.card.usage.value} pct={vm.card.usage.pct} color={p.accent} />
              <span className="rp-label">{vm.card.usage.facts}</span>
            </div>
          )}
          <p className="rp-note">{vm.card.coverage}</p>
        </>
      )}
    </Card>
  );
}

// Who asks the most, or what is asked the most, as the activity page ranks traffic.
function RankingCard({analysis, sparse}: {analysis: Analysis; sparse: boolean}) {
  const t = useT();
  const p = usePalette();
  const [by, setBy] = useState('device');
  const ranking = by === 'device' ? analysis.devices : analysis.domains;
  const top = ranking.top[0]?.count ?? 1;
  return (
    <Card
      title={t('dns.chart.ranking')}
      aside={
        !sparse && (
          <Segmented
            label={t('dns.chart.ranking')}
            value={by}
            onChange={setBy}
            items={[
              ['device', t('dns.chart.byDevice')],
              ['domain', t('dns.chart.byDomain')]
            ]}
          />
        )
      }
    >
      {sparse ? (
        <Empty>{t('dns.chart.tooFew')}</Empty>
      ) : (
        <>
          <div className="rp-list">
            {ranking.top.map(item => (
              <Bar
                key={item.key ?? ''}
                label={item.key ?? t('dns.chart.resolver')}
                value={t('dns.chart.count', {n: item.count})}
                pct={(item.count / top) * 100}
                color={by === 'device' ? p.cat[0] : p.cat[3]}
              />
            ))}
          </div>
          {ranking.rest > 0 && <p className="rp-note">{t('dns.chart.rest', {n: ranking.rest})}</p>}
        </>
      )}
    </Card>
  );
}
