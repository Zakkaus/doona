import {useMemo} from 'react';
import {useT} from '../../i18n';
import type {Connection} from '../../api/model';
import {outboundLabel} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {usePalette} from '../../ui/Charts';
import {ChartCard, FactStrip, Scatter, ScatterLegend, type ChartFact} from '../../ui/charts';
import Download from '../../ui/icons/Download';
import Link from '../../ui/icons/Link';
import Upload from '../../ui/icons/Upload';
import {trafficSeries} from './scatter';

// Upload against download for the connections the table shows; the heavy ones stand apart from the crowd.
export function Traffic({
  records,
  outbounds,
  truncated,
  onSelect
}: {
  records: Connection[];
  // Every outbound in the snapshot, before filters: colours follow it, so filtering never recolours a series.
  outbounds: Array<string | null>;
  truncated: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const p = usePalette();
  const view = useMemo(() => trafficSeries(records), [records]);
  const bytes = (value: number) => formatBytes(String(Math.round(value)));
  // As on the activity page, block takes the negative colour; the others take category colours by their place among
  // all outbounds, in an order that keeps neighbouring hues apart (the first two are both blue-green in some palettes).
  const order = [0, 2, 3, 1, 4, 5, 6, 7];
  const others = outbounds.filter(outbound => outbound !== 'block');
  const colour = (outbound: string | null) => (outbound === 'block' ? p.negative : p.cat[order[Math.max(0, others.indexOf(outbound)) % order.length]]);
  const series = view.series.map(s => ({
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
  const facts: ChartFact[] = view.heaviest
    ? [
        {
          label: t('conn.chart.busiest'),
          icon: <Link />,
          tint: 'c3',
          value: t('conn.chart.named', {name: view.heaviest.name, outbound: outboundLabel(view.heaviest.outbound, t)})
        },
        {label: t('conn.chart.down'), value: bytes(view.heaviest.down), icon: <Download />, tint: 'c1'},
        {label: t('conn.chart.up'), value: bytes(view.heaviest.up), icon: <Upload />, tint: 'c4'}
      ]
    : [];
  const sample = view.unknown ? t('conn.chart.sampleUnknown', {n: records.length, unknown: view.unknown}) : t('conn.chart.sample', {n: records.length});
  return (
    <div className="rp-chart-page">
      <FactStrip facts={facts} />
      <ChartCard title={t('conn.chart.title')} note={sample}>
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
      </ChartCard>
    </div>
  );
}
