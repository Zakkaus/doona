import {lazy, memo, Suspense, useMemo} from 'react';
import type {ComponentProps} from 'react';
import {useT} from '../../i18n';
import {LoadBoundary} from '../LoadBoundary';
import {LegendItem} from './LegendItem';
export type Series = {label: string; color: string; values: Array<number | null>};
const LazyAreaChart = lazy(() => import('./AreaChart').then(module => ({default: module.AreaPlot})));
const LazySpark = lazy(() => import('./Sparkline').then(module => ({default: module.SparkPlot})));
const LazyDonut = lazy(() => import('./Donut').then(module => ({default: module.DonutPlot})));
export function Legend({series, fmt}: {series: Series[]; fmt: (v: number | null | undefined) => string}) {
  return (
    <div className="rp-legend">
      {series.map(s => (
        <LegendItem key={s.label} swatch={s.color} label={s.label} value={fmt(s.values[s.values.length - 1])} />
      ))}
    </div>
  );
}
export const AreaChart = memo(function AreaChart(props: ComponentProps<typeof LazyAreaChart>) {
  return (
    <LoadBoundary>
      <Suspense
        fallback={<div style={props.fill ? {minHeight: props.height ?? 150, flex: '1 1 auto', width: '100%'} : {height: props.height ?? 150, width: '100%'}} />}
      >
        <LazyAreaChart {...props} />
      </Suspense>
    </LoadBoundary>
  );
});
export const Spark = memo(function Spark(props: ComponentProps<typeof LazySpark>) {
  return (
    <LoadBoundary>
      <Suspense fallback={<div style={{height: props.height ?? 32, width: '100%'}} />}>
        <LazySpark {...props} />
      </Suspense>
    </LoadBoundary>
  );
});
// Scroll long legends so the chart does not stretch adjacent cards.
export const Donut = memo(
  function Donut({label, rows, total}: {label: string; rows: Array<{name: string; value: number | null; text: string; color: string}>; total: string}) {
    const t = useT();
    const legend = useMemo(() => rows.map(row => ({...row, percent: row.value === null ? '—' : t('ui.percent', {n: row.value})})), [rows, t]);
    return (
      <div className="rp-donut">
        <div className="box">
          <LoadBoundary>
            <Suspense fallback={null}>
              <LazyDonut label={label} rows={rows} />
            </Suspense>
          </LoadBoundary>
          <div className="center">{total}</div>
        </div>
        <div className="lst">
          {legend.map(r => (
            <div key={r.name} className="r">
              <i className="dot" style={{background: r.color}} />
              <span className="n">{r.name}</span>
              <span>{r.text}</span>
              <span className="p">{r.percent}</span>
            </div>
          ))}
        </div>
      </div>
    );
  },
  (previous, next) =>
    previous.label === next.label &&
    previous.total === next.total &&
    (previous.rows === next.rows ||
      (previous.rows.length === next.rows.length &&
        previous.rows.every((row, index) => {
          const other = next.rows[index];
          return row.name === other.name && row.value === other.value && row.text === other.text && row.color === other.color;
        })))
);
