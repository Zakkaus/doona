import {formatLatency} from '../../i18n/format';
import {useMemo, useState} from 'react';
import {useT, type Translator} from '../../i18n';
import {useNow} from '../../store';
import {useDnsStatsTab} from './useDns';
import {Card, Bar, Empty, ErrorMessage, Loading, Segmented} from '../../ui/ui';
import type {DnsCacheList, DnsLogRecord} from '../../api/model';
import {usePalette, Beeswarm, FactStrip, LegendItem, ShareBar, Waffle, type ChartFact, type SwarmPoint} from '../../ui/charts';
import {dnsAnalysis, dnsOutcomes, type DnsAnalysis as Analysis, type DnsOutcome} from './stats';
import {cacheState} from './cache';
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
  const {log, cache} = useDnsStatsTab(enabled);
  if (enabled === false) return <Empty>{t('dns.logUnavailable')}</Empty>;
  // Not known yet, or capabilities failed: the page says why above the tabs.
  if (enabled === undefined) return null;
  if (log.error && !log.data) return <ErrorMessage error={log.error} onRetry={log.refetch} />;
  if (!log.data) return <Loading />;
  return <DnsAnalysis records={log.data.records} cache={cache} />;
}

function DnsAnalysis({records, cache}: {records: DnsLogRecord[]; cache: DnsCacheList | undefined | null}) {
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
  if (a.total < 5) return <Empty>{t('dns.chart.tooFew')}</Empty>;
  const facts: ChartFact[] = [
    {label: t('dns.chart.median'), value: formatLatency(a.typical, t), icon: <SpeedFast />, tint: 'c1'},
    {label: t('dns.chart.p95'), value: formatLatency(a.slowest, t), icon: <Clock />, tint: 'c4'},
    {label: t('dns.chart.cacheRate'), value: percent(a.cacheRate), icon: <Data />, tint: 'c2'},
    {label: t('dns.chart.failureRate'), value: percent(a.failureRate), icon: <AlertTriangle />, tint: 'c5', tone: a.counts.failed ? 'negative' : undefined}
  ];
  return (
    <div className="rp-chart-page">
      <FactStrip facts={facts} />
      <div className="rp-g21">
        <Card title={t('dns.chart.speed', {n: a.samples.length})} note={t('dns.chart.sample', {n: a.total, uncached: a.uncached, upstream: a.samples.length})}>
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
        </Card>
        <Card title={t('dns.chart.outcomes')}>
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
        </Card>
      </div>
      <div className="rp-g21">
        <RankingCard analysis={a} />
        <CacheCard cache={cache} t={t} shareText={shareText} />
      </div>
    </div>
  );
}

// What the cache holds now. The backend lists its entries and what kinds it caches, not a capacity, so the card says
// how many there are and how fresh, rather than how full.
function CacheCard({cache, t, shareText}: {cache: DnsCacheList | undefined | null; t: Translator; shareText: (count: number, total: number) => string}) {
  const p = usePalette();
  const now = useNow();
  const state = useMemo(() => cacheState(cache ?? undefined, now), [cache, now]);
  return (
    <Card title={t('dns.chart.cache')} note={state ? t('dns.chart.cacheNote', {n: state.total}) : undefined}>
      {cache === null ? (
        <Empty>{t('dns.cacheUnavailable')}</Empty>
      ) : !state ? (
        <Loading />
      ) : (
        <>
          <ShareBar
            label={t('dns.chart.freshness')}
            segments={[
              {
                id: 'fresh',
                label: t('dns.chart.fresh'),
                count: state.fresh,
                color: p.positive,
                text: t('dns.chart.share', {n: state.fresh, share: shareText(state.fresh, state.loaded)})
              },
              {
                id: 'stale',
                label: t('dns.chart.stale'),
                count: state.stale,
                color: p.notice,
                text: t('dns.chart.share', {n: state.stale, share: shareText(state.stale, state.loaded)})
              }
            ]}
          />
          <ShareBar
            label={t('dns.chart.kinds')}
            segments={[
              {
                id: 'positive',
                label: t('dns.chart.positive'),
                count: state.positive,
                color: p.accent,
                text: t('dns.chart.share', {n: state.positive, share: shareText(state.positive, state.loaded)})
              },
              {
                id: 'negative',
                label: t('dns.chart.negative'),
                count: state.negative,
                color: p.cat[2],
                text: t('dns.chart.share', {n: state.negative, share: shareText(state.negative, state.loaded)})
              }
            ]}
          />
          <p className="rp-note">
            {t('dns.chart.coverage', {
              kinds: [state.coverage.positive && t('dns.chart.positive'), state.coverage.negative && t('dns.chart.negative')]
                .filter(Boolean)
                .join(t('ui.listSeparator')),
              persistent: t(state.coverage.persistent ? 'dns.chart.persistent' : 'dns.chart.memoryOnly')
            })}
          </p>
        </>
      )}
    </Card>
  );
}

// Who asks the most, or what is asked the most, as the activity page ranks traffic.
function RankingCard({analysis}: {analysis: Analysis}) {
  const t = useT();
  const p = usePalette();
  const [by, setBy] = useState('device');
  const ranking = by === 'device' ? analysis.devices : analysis.domains;
  const top = ranking.top[0]?.count ?? 1;
  return (
    <Card
      title={t('dns.chart.ranking')}
      aside={
        <Segmented
          label={t('dns.chart.ranking')}
          value={by}
          onChange={setBy}
          items={[
            ['device', t('dns.chart.byDevice')],
            ['domain', t('dns.chart.byDomain')]
          ]}
        />
      }
    >
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
    </Card>
  );
}
