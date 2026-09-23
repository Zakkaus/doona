import {useMemo} from 'react';
import {useT} from '../../i18n';
import type {Connection} from '../../api/model';
import {outboundLabel} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {usePalette} from '../../ui/Charts';
import {ChartCard, Scatter, ScatterLegend} from '../../ui/charts';
import {trafficSeries} from './scatter';

// Upload against download for the connections the table shows; the heavy ones stand apart from the crowd.
export function Traffic({records, truncated, onSelect}: {records: Connection[]; truncated: boolean; onSelect: (id: string) => void}) {
  const t = useT();
  const p = usePalette();
  const view = useMemo(() => trafficSeries(records), [records]);
  const bytes = (value: number) => formatBytes(String(Math.round(value)));
  // As on the activity page: block in the negative colour, every other outbound a category colour in turn.
  let next = 0;
  const series = view.series.map(s => ({
    id: s.outbound ?? '',
    label: outboundLabel(s.outbound, t),
    color: s.outbound === 'block' ? p.negative : p.cat[next++ % p.cat.length],
    points: s.points.map(point => ({
      id: point.id,
      x: point.up,
      y: point.down,
      name: point.name,
      detail: t('conn.chart.point', {down: bytes(point.down), up: bytes(point.up)})
    }))
  }));
  const answer = view.heaviest
    ? t('conn.chart.answer', {
        name: view.heaviest.name,
        outbound: outboundLabel(view.heaviest.outbound, t),
        down: bytes(view.heaviest.down),
        up: bytes(view.heaviest.up)
      })
    : t('conn.chart.answerNone');
  const sample = [
    t('conn.chart.sample', {n: records.length}),
    view.unknown ? t('conn.chart.unknown', {n: view.unknown}) : '',
    truncated ? t('conn.truncated') : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ChartCard id="connections" defaultOpen={false} question={t('conn.chart.title')} answer={answer} sample={sample}>
      {view.placed > 0 && (
        <>
          <Scatter label={t('conn.chart.title')} series={series} fmt={bytes} onSelect={onSelect} />
          <ScatterLegend series={series} />
          <p className="rp-note">{t('conn.chart.hint')}</p>
        </>
      )}
    </ChartCard>
  );
}
