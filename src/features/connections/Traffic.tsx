import {Card} from '../../ui/ui';
import {memo, useCallback, useMemo} from 'react';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {Connection} from '../../api/model';
import {outboundLabel} from '../../api/selectors';
import {formatBytes, formatLatency} from '../../i18n/format';
import {usePalette, Beeswarm, FactStrip, LegendItem, Scatter, ScatterLegend, type ChartFact} from '../../ui/charts';
import Download from '../../ui/icons/Download';
import Link from '../../ui/icons/Link';
import Upload from '../../ui/icons/Upload';
import {trafficSeries} from './scatter';
import type {PathLatency} from './latency';

const order = [0, 2, 3, 1, 4, 5, 6, 7];

// Upload against download for the connections the table shows; the heavy ones stand apart from the crowd.
export const Traffic = memo(function Traffic({
  records,
  outbounds,
  latency,
  truncated,
  onSelect
}: {
  records: Connection[];
  // Every outbound in the snapshot, before filters: colours follow it, so filtering never recolours a series.
  outbounds: Array<string | null>;
  // Null when the backend lists no nodes or no health samples: the card is left out.
  latency: PathLatency | null;
  truncated: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const p = usePalette();
  const locale = LOCALE[useLang()];
  const bytes = useCallback((value: number) => formatBytes(value, locale), [locale]);
  const view = useMemo(() => trafficSeries(records), [records]);
  const series = useMemo(() => {
    // As on the activity page, block takes the negative colour; the others take category colours by their place
    // among all outbounds, ordered so neighbouring hues differ (some palettes start with two blue-greens).
    const others = outbounds.filter(outbound => outbound !== 'block');
    const colour = (outbound: string | null) => (outbound === 'block' ? p.negative : p.cat[order[Math.max(0, others.indexOf(outbound)) % order.length]]);
    return view.series.map(s => ({
      id: s.outbound ?? '',
      label: outboundLabel(s.outbound, t),
      color: colour(s.outbound),
      points: s.points.map(point => ({
        id: point.id,
        x: point.up,
        y: point.down,
        name: point.name,
        detail: t('conn.chart.point', {down: bytes(point.down), up: bytes(point.up)})
      }))
    }));
  }, [view, outbounds, p, t, bytes]);
  const facts: ChartFact[] = view.heaviest
    ? [
        {
          label: t('conn.chart.busiest'),
          icon: <Link />,
          tint: 'c3',
          value: view.heaviest.name,
          caption: outboundLabel(view.heaviest.outbound, t)
        },
        {label: t('conn.chart.down'), value: bytes(view.heaviest.down), icon: <Download />, tint: 'c1'},
        {label: t('conn.chart.up'), value: bytes(view.heaviest.up), icon: <Upload />, tint: 'c4'}
      ]
    : [];
  const sample = view.unknown ? t('conn.chart.sampleUnknown', {n: records.length, unknown: view.unknown}) : t('conn.chart.sample', {n: records.length});
  return (
    <div className="rp-chart-page">
      <FactStrip facts={facts} />
      <Card title={t('conn.chart.title')} note={sample}>
        {truncated && <p className="rp-note">{t('conn.truncated')}</p>}
        {view.placed > 0 && (
          <>
            <Scatter
              label={t('conn.chart.title')}
              series={series}
              fmt={bytes}
              onSelect={onSelect}
              regions={{above: t('conn.chart.moreDown'), below: t('conn.chart.moreUp')}}
            />
            <ScatterLegend series={series} />
            <p className="rp-note">{t('conn.chart.hint')}</p>
          </>
        )}
      </Card>
      {latency && <LatencyCard latency={latency} />}
    </div>
  );
});

// Every node's latency as the Nodes page shows it, one dot each; when connections name their nodes, the ones in use
// stand out.
function LatencyCard({latency}: {latency: PathLatency}) {
  const t = useT();
  const p = usePalette();
  const fmt = (value: number) => formatLatency(value, t);
  const locale = LOCALE[useLang()];
  const colour = (used: boolean) => (!latency.chains || used ? p.cat[0] : p.muted);
  return (
    <Card title={t('conn.latency.title')} note={t('conn.latency.sample', {n: latency.samples.length, missing: latency.missing})}>
      {latency.samples.length ? (
        <>
          <p className="rp-note">{t('conn.latency.percentiles', {p50: fmt(latency.p50!), p90: fmt(latency.p90!)})}</p>
          {latency.weightedP50 !== null && (
            <p className="rp-note">
              {latency.unplaced
                ? t('conn.latency.weightedUnplaced', {p50: fmt(latency.weightedP50), n: latency.unplaced})
                : t('conn.latency.weighted', {p50: fmt(latency.weightedP50)})}
            </p>
          )}
          <Beeswarm
            label={t('conn.latency.title')}
            points={latency.samples.map(sample => ({
              id: sample.node,
              value: sample.value,
              color: colour(sample.connections > 0),
              lines: [sample.name, fmt(sample.value), ...(sample.connections ? [t('conn.chart.sample', {n: sample.connections})] : [])]
            }))}
            fmt={fmt}
          />
          {latency.chains && (
            <div className="rp-legend">
              <LegendItem swatch={colour(true)} label={t('conn.latency.inUse')} value={formatNumber(latency.used, locale)} />
              <LegendItem swatch={colour(false)} label={t('conn.latency.others')} value={formatNumber(latency.samples.length - latency.used, locale)} />
            </div>
          )}
          <p className="rp-note">{t('conn.latency.hint')}</p>
        </>
      ) : (
        <p className="rp-note">{t('conn.latency.pending')}</p>
      )}
    </Card>
  );
}
