import {lazy, memo, Suspense, useId, useMemo, useState} from 'react';
import type {ComponentProps, FocusEvent} from 'react';
import {useT} from '../../i18n';
import {localTimeFormat} from '../../i18n/format';
import {LoadBoundary} from '../LoadBoundary';
import {usePalette, type Palette} from './palette';
import {LegendItem} from './LegendItem';
// Debounce chart relayout so a resize drag triggers one render after it settles.
const RESIZE_DEBOUNCE = 120;
// Pointer exit hides stale tooltips without disabling Recharts keyboard navigation.
function useHover() {
  const [inside, setInside] = useState(false);
  const [focused, setFocused] = useState(false);
  return {
    inside: inside || focused,
    handlers: {
      onPointerEnter: () => setInside(true),
      onPointerLeave: () => setInside(false),
      onFocus: () => setFocused(true),
      onBlur: (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }
    }
  };
}
const areaMargin = {top: 8, right: 0, bottom: 0, left: 20};
const sparkMargin = {top: 2, right: 0, bottom: 2, left: 0};
const donutMargin = {top: 0, right: 0, bottom: 0, left: 0};
const activeDot = {r: 4, strokeWidth: 2};
const dataDomain = ['dataMin', 'dataMax'];

type Series = {label: string; color: string; values: Array<number | null>};
const niceMax = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10;
  return s * p;
};
const niceStep = (range: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(range, 1e-9))));
  const n = range / p;
  const s = n <= 1 ? 0.2 : n <= 2 ? 0.5 : n <= 5 ? 1 : 2;
  return s * p;
};
// Use three to six round clock ticks, excluding marks whose labels would overhang the axis.
const tickSteps = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map(s => s * 1000);
function clockTicks(since: number, until: number): {ticks: number[]; step: number} {
  const span = until - since;
  const step = tickSteps.find(s => span / s <= 6) ?? tickSteps[tickSteps.length - 1];
  // Day and longer steps align to local midnight; shorter ones to the epoch, which lands on round minutes.
  const offset = step >= 86400000 ? new Date(until).getTimezoneOffset() * 60000 : 0;
  const first = Math.ceil((since - offset) / step) * step + offset;
  const ticks: number[] = [];
  for (let t = first; t <= until; t += step) if (t - since >= span * 0.04 && until - t >= span * 0.04) ticks.push(t);
  return {ticks, step};
}
const tip = (p: Palette) => ({backgroundColor: p.text, color: p['on-text'], border: 'none', borderRadius: 8, fontSize: 12, padding: '8px 12px'});
function useChartStyle(p: Palette) {
  return useMemo(
    () => ({
      content: tip(p),
      item: {color: p['on-text']},
      tick: {fontSize: 11, fill: p.subtle},
      cursor: {stroke: p.subtle, strokeDasharray: '3 3'}
    }),
    [p]
  );
}

export function Legend({series, fmt}: {series: Series[]; fmt: (v: number | null | undefined) => string}) {
  return (
    <div className="rp-legend">
      {series.map(s => (
        <LegendItem key={s.label} swatch={s.color} label={s.label} value={fmt(s.values[s.values.length - 1])} />
      ))}
    </div>
  );
}
const LazyAreaChart = lazy(() =>
  import('recharts').then(({AreaChart: RAreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis}) => ({
    default: function AreaChart({
      label,
      series,
      timestamps,
      fmt,
      locale,
      height = 150,
      baseline = 'zero',
      window,
      fill
    }: {
      // The chart takes keyboard focus to step through samples, so it needs a name of its own.
      label: string;
      series: Series[];
      timestamps: number[];
      fmt: (v: number) => string;
      locale: string;
      height?: number;
      // Grow with the card, using height as the floor.
      fill?: boolean;
      // Fixed time bounds preserve a young session's position within the observation window.
      window?: {since: number; until: number};
      // Rates start at zero; a level such as memory zooms to its own range so small movements stay visible.
      baseline?: 'zero' | 'auto';
    }) {
      const p = usePalette();
      const style = useChartStyle(p);
      const uid = useId();
      const hover = useHover();
      const span = window ? window.until - window.since : timestamps.length ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
      const since = window?.since;
      const until = window?.until;
      const marks = useMemo(() => (since !== undefined && until !== undefined ? clockTicks(since, until) : undefined), [since, until]);
      const withSeconds = marks ? marks.step < 60000 : span < 3 * 60 * 1000;
      // Use dates for day-scale windows and seconds for sub-minute tick spacing.
      const withDate = marks ? marks.step >= 86400000 : span > 36 * 60 * 60 * 1000;
      const clock = useMemo(
        () =>
          new Intl.DateTimeFormat(
            locale,
            withDate
              ? {month: 'numeric', day: 'numeric'}
              : withSeconds
                ? {hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}
                : {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}
          ),
        [locale, withSeconds, withDate]
      );
      const data = useMemo(() => timestamps.map((t, i) => Object.fromEntries([['t', t], ...series.map(s => [s.label, s.values[i]])])), [timestamps, series]);
      const {yDomain, yTicks} = useMemo(() => {
        const values = series.flatMap(s => s.values.filter((v): v is number => v !== null));
        let lo = 0;
        let max = niceMax(Math.max(1, ...values) * 1.08);
        if (baseline === 'auto' && values.length) {
          const min = Math.min(...values);
          const top = Math.max(...values);
          const step = niceStep(Math.max(top - min, top * 0.02, 1));
          lo = Math.max(0, Math.floor(min / step) * step - step);
          max = Math.ceil(top / step) * step + step;
        }
        return {yDomain: [lo, max], yTicks: baseline === 'auto' ? [lo, (lo + max) / 2, max] : [max / 2, max]};
      }, [series, baseline]);
      const ticks = useMemo(() => {
        const last = timestamps.length - 1;
        return marks
          ? marks.ticks
          : [...new Set((withSeconds ? [0, Math.round(last / 2), last] : [0, Math.round(last / 3), Math.round((2 * last) / 3), last]).map(i => timestamps[i]))];
      }, [marks, withSeconds, timestamps]);
      const domain = useMemo<[number | string, number | string]>(
        () => (since !== undefined && until !== undefined ? [since, until] : ['dataMin', 'dataMax']),
        [since, until]
      );
      const box = {height, width: '100%', flex: fill ? '1 1 auto' : undefined};
      if (!timestamps.length) return <div style={box} />;
      return (
        <div style={box} {...hover.handlers}>
          <ResponsiveContainer width="100%" height="100%" debounce={RESIZE_DEBOUNCE}>
            <RAreaChart data={data} margin={areaMargin} aria-label={label}>
              <defs>
                {series.map((s, k) => (
                  <linearGradient key={s.label} id={uid + k} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke={p['hl-med']} strokeDasharray="2 4" />
              <XAxis
                dataKey="t"
                type="number"
                domain={domain}
                ticks={ticks}
                tickFormatter={value => clock.format(value)}
                tick={style.tick}
                axisLine={false}
                tickLine={false}
                // A narrow card cannot fit every clock mark; overlapping labels are thinned, the ends kept.
                interval={marks ? 'preserveStartEnd' : 0}
                minTickGap={16}
              />
              <YAxis
                orientation="right"
                ticks={yTicks}
                domain={yDomain}
                tickFormatter={v => fmt(v)}
                tick={style.tick}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                active={hover.inside ? undefined : false}
                contentStyle={style.content}
                itemStyle={style.item}
                labelFormatter={value => localTimeFormat(locale).format(Number(value))}
                formatter={v => fmt(Number(v))}
                cursor={style.cursor}
              />
              {series.map((s, k) => (
                <Area
                  key={s.label}
                  type="monotone"
                  dataKey={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${uid + k})`}
                  dot={false}
                  activeDot={activeDot}
                  isAnimationActive={false}
                />
              ))}
            </RAreaChart>
          </ResponsiveContainer>
        </div>
      );
    }
  }))
);

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
const LazySpark = lazy(() =>
  import('recharts').then(({AreaChart: RAreaChart, Area, ResponsiveContainer, XAxis, YAxis}) => ({
    default: function Spark({
      values,
      timestamps,
      color,
      height = 32,
      floor = 0
    }: {
      values: Array<number | null>;
      timestamps: number[];
      color: string;
      height?: number;
      // The least the axis spans from zero, so a trickle is drawn flat instead of blown up to fill the tile.
      floor?: number;
    }) {
      const uid = useId();
      const data = useMemo(() => values.map((v, i) => ({t: timestamps[i], v})), [values, timestamps]);
      const {domain, hasValues} = useMemo(() => {
        const known = values.filter((v): v is number => v !== null);
        return {
          hasValues: known.length > 0,
          domain: [floor > 0 ? 0 : Math.min(...known) * 0.85, Math.max(Math.max(...known) * 1.05 || 1, floor)]
        };
      }, [values, floor]);
      if (!hasValues) return <div style={{height, width: '100%'}} />;
      return (
        <div style={{height, width: '100%'}} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%" debounce={RESIZE_DEBOUNCE}>
            {/* Decorative: the tile states the value, so the spark is no focus stop. */}
            <RAreaChart data={data} margin={sparkMargin} accessibilityLayer={false}>
              <defs>
                <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <XAxis hide dataKey="t" type="number" domain={dataDomain} />
              <YAxis hide domain={domain} />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${uid})`} dot={false} isAnimationActive={false} />
            </RAreaChart>
          </ResponsiveContainer>
        </div>
      );
    }
  }))
);

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

const LazyDonut = lazy(() =>
  import('recharts').then(({PieChart, Pie, Cell, ResponsiveContainer, Tooltip}) => ({
    default: function DonutPlot({label, rows}: Pick<ComponentProps<typeof Donut>, 'label' | 'rows'>) {
      const t = useT();
      const p = usePalette();
      const style = useChartStyle(p);
      const hover = useHover();
      const data = useMemo(() => rows.filter(r => r.value !== null && r.value > 0), [rows]);
      return (
        <div style={{height: '100%', width: '100%'}} {...hover.handlers}>
          <ResponsiveContainer width="100%" height="100%" debounce={RESIZE_DEBOUNCE}>
            <PieChart margin={donutMargin} aria-label={label}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={44}
                outerRadius={56}
                minAngle={6}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
              >
                {data.map(r => (
                  <Cell key={r.name} fill={r.color} />
                ))}
              </Pie>
              <Tooltip
                active={hover.inside ? undefined : false}
                contentStyle={style.content}
                itemStyle={style.item}
                formatter={(v, name, item) => {
                  const payload: unknown = item.payload;
                  const bytes = payload && typeof payload === 'object' && 'text' in payload && typeof payload.text === 'string' ? payload.text : '';
                  return [t('ui.share', {bytes, percent: String(v)}), String(name)];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }
  }))
);
