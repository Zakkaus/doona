// Recharts drawn with the Rosé Pine variables (read from the document so they follow the theme switch).
import {lazy, Suspense, useId, useMemo, useSyncExternalStore} from 'react';
import type {ComponentProps} from 'react';
import {formatNumber, useT, type Translator} from '../i18n';

export type Series = {label: string; color: string; values: Array<number | null>};
const VARS = [
  'base',
  'surface',
  'overlay',
  'muted',
  'subtle',
  'text',
  'on-text',
  'love',
  'gold',
  'rose',
  'pine',
  'foam',
  'iris',
  'hl-low',
  'hl-med',
  'hl-high'
] as const;
export type Palette = Record<(typeof VARS)[number], string> & {cat: string[]};
function read(): Palette {
  const cs = getComputedStyle(document.documentElement);
  return {
    ...Object.fromEntries(VARS.map(v => [v, cs.getPropertyValue('--rp-' + v).trim()])),
    cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => cs.getPropertyValue('--rp-c' + i).trim())
  } as Palette;
}
let palette: {key: string; value: Palette} | undefined;
function getPalette() {
  const {family, flavour, scheme} = document.documentElement.dataset;
  const key = `${family}/${flavour}/${scheme}`;
  if (palette?.key !== key) palette = {key, value: read()};
  return palette.value;
}
function subscribePalette(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {attributes: true, attributeFilter: ['data-family', 'data-flavour', 'data-scheme']});
  return () => mo.disconnect();
}
export function usePalette() {
  return useSyncExternalStore(subscribePalette, getPalette);
}
export const fmtRate = (kb: number | null | undefined, locale: string, t: Translator) =>
  kb == null
    ? '—'
    : kb >= 1000
      ? t('unit.mbPerSecond', {n: formatNumber(kb / 1000, locale, kb >= 10000 || kb % 1000 === 0 ? 0 : 1)})
      : t('unit.kbPerSecond', {n: formatNumber(Math.round(kb), locale)});
const niceMax = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10;
  return s * p;
};
// A step that divides the range into a few round intervals, for axes that do not start at zero.
const niceStep = (range: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(range, 1e-9))));
  const n = range / p;
  const s = n <= 1 ? 0.2 : n <= 2 ? 0.5 : n <= 5 ? 1 : 2;
  return s * p;
};
// Tick marks on round clock values for a fixed window: the step that yields three to six marks. Marks within
// a few percent of either edge are dropped, since their labels would hang outside the axis.
const tickSteps = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map(s => s * 1000);
export function clockTicks(since: number, until: number): {ticks: number[]; step: number} {
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

export function Legend({series, fmt}: {series: Series[]; fmt: (v: number | null | undefined) => string}) {
  return (
    <div className="rp-legend">
      {series.map(s => (
        <span key={s.label} className="it">
          <i className="sw" style={{background: s.color}} />
          {s.label} <b>{fmt(s.values[s.values.length - 1])}</b>
        </span>
      ))}
    </div>
  );
}
const LazyAreaChart = lazy(() =>
  import('recharts').then(({AreaChart: RAreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis}) => ({
    default: function AreaChart({
      series,
      timestamps,
      fmt,
      locale,
      height = 150,
      baseline = 'zero',
      window
    }: {
      series: Series[];
      timestamps: number[];
      fmt: (v: number) => string;
      locale: string;
      height?: number;
      // A fixed span for the x axis: the chart is read against the window, so a young session sits at the
      // right edge instead of being stretched across the width. Without it the axis fits the data.
      window?: {since: number; until: number};
      // Rates start at zero; a level such as memory zooms to its own range so small movements stay visible.
      baseline?: 'zero' | 'auto';
    }) {
      const p = usePalette();
      const uid = useId();
      const span = window ? window.until - window.since : timestamps.length ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
      const marks = window ? clockTicks(window.since, window.until) : undefined;
      const withSeconds = marks ? marks.step < 60000 : span < 3 * 60 * 1000;
      // Day marks sit on midnight, so they read as dates; anything finer reads as a 24-hour clock, with seconds
      // when the marks are closer than a minute.
      const withDate = marks ? marks.step >= 86400000 : span > 36 * 60 * 60 * 1000;
      const clock = useMemo(
        () =>
          new Intl.DateTimeFormat(
            locale,
            withDate
              ? {month: 'numeric', day: 'numeric'}
              : withSeconds
                ? {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}
                : {hour: '2-digit', minute: '2-digit', hour12: false}
          ),
        [locale, withSeconds, withDate]
      );
      const date = useMemo(() => new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeStyle: 'medium'}), [locale]);
      if (!timestamps.length) return null;
      const last = timestamps.length - 1;
      const data = timestamps.map((t, i) => Object.fromEntries([['t', t], ...series.map(s => [s.label, s.values[i]])]));
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
      const yTicks = baseline === 'auto' ? [lo, (lo + max) / 2, max] : [max / 2, max];
      // A fixed window gets ticks on round clock marks (every 30 s, 2 min, 15 min, 1 h, 6 h, 1 d); a free axis
      // shows its ends and thirds.
      const ticks = marks
        ? marks.ticks
        : [...new Set((withSeconds ? [0, Math.round(last / 2), last] : [0, Math.round(last / 3), Math.round((2 * last) / 3), last]).map(i => timestamps[i]))];
      const domain: [number | string, number | string] = window ? [window.since, window.until] : ['dataMin', 'dataMax'];
      return (
        <div style={{height, width: '100%'}}>
          <ResponsiveContainer width="100%" height="100%">
            <RAreaChart data={data} margin={{top: 8, right: 0, bottom: 0, left: 20}}>
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
                tick={{fontSize: 11, fill: p.subtle}}
                axisLine={false}
                tickLine={false}
                // A narrow card cannot fit every clock mark; overlapping labels are thinned, the ends kept.
                interval={marks ? 'preserveStartEnd' : 0}
                minTickGap={16}
              />
              <YAxis
                orientation="right"
                ticks={yTicks}
                domain={[lo, max]}
                tickFormatter={v => fmt(v)}
                tick={{fontSize: 11, fill: p.subtle}}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                contentStyle={tip(p)}
                itemStyle={{color: p['on-text']}}
                labelFormatter={value => date.format(Number(value))}
                formatter={v => fmt(Number(v))}
                cursor={{stroke: p.subtle, strokeDasharray: '3 3'}}
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
                  activeDot={{r: 4, strokeWidth: 2}}
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

export function AreaChart(props: ComponentProps<typeof LazyAreaChart>) {
  return (
    <Suspense fallback={<div style={{height: props.height ?? 150, width: '100%'}} />}>
      <LazyAreaChart {...props} />
    </Suspense>
  );
}
const LazySpark = lazy(() =>
  import('recharts').then(({AreaChart: RAreaChart, Area, ResponsiveContainer, XAxis, YAxis}) => ({
    default: function Spark({values, timestamps, color, height = 32}: {values: Array<number | null>; timestamps: number[]; color: string; height?: number}) {
      const uid = useId();
      const known = values.filter((v): v is number => v !== null);
      if (!known.length) return null;
      const data = values.map((v, i) => ({t: timestamps[i], v}));
      const lo = Math.min(...known) * 0.85,
        hi = Math.max(...known) * 1.05 || 1;
      return (
        <div style={{height, width: '100%'}}>
          <ResponsiveContainer width="100%" height="100%">
            <RAreaChart data={data} margin={{top: 2, right: 0, bottom: 2, left: 0}}>
              <defs>
                <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <XAxis hide dataKey="t" type="number" domain={['dataMin', 'dataMax']} />
              <YAxis hide domain={[lo, hi]} />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${uid})`} dot={false} isAnimationActive={false} />
            </RAreaChart>
          </ResponsiveContainer>
        </div>
      );
    }
  }))
);

export function Spark(props: ComponentProps<typeof LazySpark>) {
  return (
    <Suspense fallback={<div style={{height: props.height ?? 32, width: '100%'}} />}>
      <LazySpark {...props} />
    </Suspense>
  );
}
export function Donut({rows, total}: {rows: Array<{name: string; value: number | null; text: string; color: string}>; total: string}) {
  const t = useT();
  return (
    <div className="rp-donut">
      <div className="box">
        <Suspense fallback={null}>
          <LazyDonut rows={rows} />
        </Suspense>
        <div className="center">{total}</div>
      </div>
      <div className="lst">
        {rows.map(r => (
          <div key={r.name} className="r">
            <i className="dot" style={{background: r.color}} />
            <span className="n">{r.name}</span>
            <span>{r.text}</span>
            <span className="p">{r.value === null ? '—' : t('ui.percent', {n: r.value})}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const LazyDonut = lazy(() =>
  import('recharts').then(({PieChart, Pie, Cell, ResponsiveContainer, Tooltip}) => ({
    default: function DonutPlot({rows}: Pick<ComponentProps<typeof Donut>, 'rows'>) {
      const t = useT();
      const p = usePalette();
      const data = rows.filter(r => r.value !== null && r.value > 0);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{top: 0, right: 0, bottom: 0, left: 0}}>
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
              contentStyle={tip(p)}
              itemStyle={{color: p['on-text']}}
              formatter={(v, name, item) => {
                const payload: unknown = item.payload;
                const bytes = payload && typeof payload === 'object' && 'text' in payload && typeof payload.text === 'string' ? payload.text : '';
                return [t('ui.share', {bytes, percent: String(v)}), String(name)];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }
  }))
);
