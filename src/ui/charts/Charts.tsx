import {lazy, memo, Suspense, useMemo} from 'react';
import type {ComponentProps, ReactNode} from 'react';
import {useT} from '../../i18n';
import {LoadBoundary} from '../LoadBoundary';
import {LegendItem} from './LegendItem';
import {Link} from '../Link';
export type Series = {label: string; color: string; values: Array<number | null>};
const LazyAreaChart = lazy(() => import('./AreaChart').then(module => ({default: module.AreaPlot})));
const LazySpark = lazy(() => import('./Sparkline').then(module => ({default: module.SparkPlot})));
const LazyDonut = lazy(() => import('./Donut').then(module => ({default: module.DonutPlot})));
export function seriesTipLines(series: Series[], index: number, fmt: (v: number) => string, t: ReturnType<typeof useT>) {
  return series
    .filter(s => s.values[index] != null)
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    .map(s => t('ui.valuePair', {label: s.label, value: fmt(s.values[index]!)}));
}
export function Legend({series, fmt, widest}: {series: Series[]; fmt: (v: number | null | undefined) => string; widest?: string}) {
  return (
    <div className="rp-legend">
      {series.map(s => (
        <LegendItem key={s.label} swatch={s.color} label={s.label} value={fmt(s.values[s.values.length - 1])} widest={widest} />
      ))}
    </div>
  );
}
// Whether an area chart stacks a plot per series (AreaPlot's `split`), which makes it --rp-chart-stacked-h tall.
export const stackedPlots = ({split, bare, series}: {split?: boolean; bare?: boolean; series: Series[]}) => !!split && !bare && series.length > 1;
// `legend`: the chart's legend above it. The two take one legend line and the chart's height at least, and a legend
// wrapped onto more lines takes its room from the plot, never from the card's row (.rp-area-figure).
export const AreaChart = memo(function AreaChart({legend, ...props}: ComponentProps<typeof LazyAreaChart> & {legend?: ReactNode}) {
  const stacked = stackedPlots(props) || undefined;
  const plot = (
    <LoadBoundary>
      <Suspense
        fallback={
          <div className="rp-area-plot" data-stacked={stacked} data-fill={props.fill || undefined} style={props.bare ? {height: props.height} : undefined} />
        }
      >
        <LazyAreaChart {...props} />
      </Suspense>
    </LoadBoundary>
  );
  if (!legend) return plot;
  return (
    <div className="rp-area-figure" data-stacked={stacked}>
      {legend}
      {plot}
    </div>
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
// Scroll long legends so the chart does not stretch adjacent cards. A row with `href` names what it opens.
export const Donut = memo(
  function Donut({
    label,
    rows,
    total,
    legendLimit
  }: {
    label: string;
    rows: Array<{name: string; value: number | null; text: string; color: string; href?: string}>;
    total: string;
    legendLimit?: number;
  }) {
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
          {legend.slice(0, legendLimit).map(r => (
            <div key={r.name} className="r">
              <i className="dot" style={{background: r.color}} />
              <span className="n">
                {r.href ? (
                  <Link appearance="link" href={r.href}>
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </span>
              <span className="v">{r.text}</span>
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
    previous.legendLimit === next.legendLimit &&
    (previous.rows === next.rows ||
      (previous.rows.length === next.rows.length &&
        previous.rows.every((row, index) => {
          const other = next.rows[index];
          return row.name === other.name && row.value === other.value && row.text === other.text && row.color === other.color && row.href === other.href;
        })))
);
