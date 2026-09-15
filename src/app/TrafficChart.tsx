// Charts for the activity page, drawn with Recharts and coloured with Spectrum 2 values (accent blue, orange-700, green-800).
import {useEffect, useId, useRef, useState} from 'react';
import {AreaChart as RAreaChart, Area, PieChart, Pie, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {ReactNode} from 'react';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};

export type SeriesColor = 'accent' | 'accent2' | 'orange' | 'green' | 'purple' | 'red' | 'warn' | 'dark' | 'muted' | 'muted2';
export type Series = {label: string, color: SeriesColor, values: number[]};
type Palette = Record<SeriesColor, string> & {grid: string, text: string, tip: string, tipText: string};
// Yellow leads (yellow-600 for contrast on the light surface, yellow-400 as its lighter step), gray-700 is the second traffic series (a neutral, so yellow stays the only accent), grays for the rest; warn is orange-600 for slow nodes, red-700 for block, dark (gray-800) for timeouts.
const LIGHT: Palette = {accent: '#D29500', accent2: '#F5C700', orange: '#505050', green: '#0DB595', purple: '#8480FE', red: '#FF513D', warn: '#FC7D00', dark: '#292929', muted: '#8F8F8F', muted2: '#C6C6C6', grid: '#E1E1E1', text: '#6D6D6D', tip: '#FFFFFF', tipText: '#222222'};
const DARK: Palette = {accent: '#F5C700', accent2: '#D29500', orange: '#AFAFAF', green: '#0DB595', purple: '#8480FE', red: '#FF513D', warn: '#FC7D00', dark: '#E1E1E1', muted: '#8A8A8A', muted2: '#5A5A5A', grid: '#3E3E3E', text: '#B0B0B0', tip: '#2A2A2A', tipText: '#F0F0F0'};
const swatchClass: Record<SeriesColor, string> = {accent: style({backgroundColor: 'yellow-600'}), accent2: style({backgroundColor: 'yellow-400'}), orange: style({backgroundColor: 'gray-700'}), green: style({backgroundColor: 'seafoam-600'}), purple: style({backgroundColor: 'indigo-700'}), red: style({backgroundColor: 'red-700'}), warn: style({backgroundColor: 'orange-600'}), dark: style({backgroundColor: 'gray-800'}), muted: style({backgroundColor: 'gray-500'}), muted2: style({backgroundColor: 'gray-400'})};
const box = style({width: 'full'});
const legendRow = style({display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', font: 'ui-sm', color: 'gray-800'});
const legendItem = style({display: 'flex', alignItems: 'center', gap: 8});
const swatch = style({display: 'inline-block', width: 8, height: 8, borderRadius: 'full', flexShrink: 0});
const legendVal = style({fontWeight: 'bold', color: 'neutral'});

export const fmtRate = (kb: number) => kb >= 1000 ? (kb / 1000).toFixed(kb >= 10000 || kb % 1000 === 0 ? 0 : 1) + ' MB/s' : Math.round(kb) + ' KB/s';
export const fmtCount = (n: number) => String(Math.round(n));
const niceMax = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10; return s * p; };
const clock = (msAgo: number) => { const d = new Date(Date.now() - msAgo); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

// Follows the colour scheme of the surrounding S2 Provider (the CSS color-scheme property inherits down to the chart host).
export function usePalette<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => setDark(getComputedStyle(el).colorScheme === 'dark');
    read();
    const mo = new MutationObserver(read); mo.observe(document.documentElement, {attributes: true, subtree: true, attributeFilter: ['data-color-scheme', 'style', 'class']});
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', read);
    return () => { mo.disconnect(); mq.removeEventListener('change', read); };
  }, []);
  return [dark ? DARK : LIGHT, ref] as const;
}

// Legend with the current value of each series, for the panel head next to the title.
export function Legend({series, fmt}: {series: Series[], fmt: (v: number) => string}) {
  return (
    <div className={legendRow}>
      {series.map(s => <span key={s.label} className={legendItem}><i className={swatch + ' ' + swatchClass[s.color]} />{s.label} <span className={legendVal}>{fmt(s.values[s.values.length - 1])}</span></span>)}
    </div>
  );
}

const tipStyle = (p: Palette) => ({backgroundColor: p.tip, color: p.tipText, border: 'none', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', fontSize: 12, padding: '8px 12px'});

export function AreaChart({series, fmt, height = 150, step = 10_000}: {series: Series[], fmt: (v: number) => string, height?: number, step?: number}) {
  const [p, ref] = usePalette<HTMLDivElement>();
  const uid = useId();
  const n = series[0].values.length, last = n - 1;
  const data = Array.from({length: n}, (_, i) => Object.fromEntries([['t', clock((last - i) * step)], ...series.map(s => [s.label, s.values[i]])]));
  const max = niceMax(Math.max(...series.flatMap(s => s.values)) * 1.08);
  const ticks = [0, Math.round(last / 3), Math.round((2 * last) / 3), last].map(i => data[i].t as string);
  return (
    <div ref={ref} className={box} style={{height}}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={data} margin={{top: 8, right: 0, bottom: 0, left: 20}}>
          <defs>{series.map((s, k) => <linearGradient key={s.label} id={uid + k} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={p[s.color]} stopOpacity={0.4} /><stop offset="100%" stopColor={p[s.color]} stopOpacity={0.04} /></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke={p.grid} strokeDasharray="2 4" />
          <XAxis dataKey="t" ticks={ticks} tick={{fontSize: 11, fill: p.text}} axisLine={false} tickLine={false} interval={0} />
          <YAxis orientation="right" ticks={[max / 2, max]} domain={[0, max]} tickFormatter={v => fmt(v)} tick={{fontSize: 11, fill: p.text}} axisLine={false} tickLine={false} width={64} mirror={false} />
          <Tooltip contentStyle={tipStyle(p)} itemStyle={{color: p.tipText}} formatter={v => fmt(Number(v))} cursor={{stroke: p.text, strokeDasharray: '3 3'}} />
          {series.map((s, k) => <Area key={s.label} type="monotone" dataKey={s.label} stroke={p[s.color]} strokeWidth={2} fill={`url(#${uid + k})`} dot={false} activeDot={{r: 4, strokeWidth: 2}} isAnimationActive={false} />)}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bare sparkline for a stat tile: the series shape only, floor just under the minimum.
export function Spark({values, color, height = 32}: {values: number[], color: SeriesColor, height?: number}) {
  const [p, ref] = usePalette<HTMLDivElement>();
  const uid = useId();
  if (!values.length) return null;
  const data = values.map((v, i) => ({i, v}));
  const lo = Math.min(...values) * 0.85, hi = Math.max(...values) * 1.05 || 1;
  return (
    <div ref={ref} className={box} style={{height}}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={data} margin={{top: 2, right: 0, bottom: 2, left: 0}}>
          <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={p[color]} stopOpacity={0.22} /><stop offset="100%" stopColor={p[color]} stopOpacity={0.02} /></linearGradient></defs>
          <YAxis hide domain={[lo, hi]} />
          <Area type="monotone" dataKey="v" stroke={p[color]} strokeWidth={1.5} fill={`url(#${uid})`} dot={false} isAnimationActive={false} />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Donut for a breakdown (outbound usage): the total in the middle, a list with colour, bytes and share beside it.
const donutWrap = style({display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'});
const donutBox = style({flexShrink: 0, position: 'relative', width: 112, height: 112});
const donutCenter = style({position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'});
const donutTotal = style({font: 'title-lg', lineHeight: 'ui'});
const donutSub = style({font: 'detail'});
const donutList = style({flexGrow: 1, flexBasis: 160, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4});
const donutBytes = style({whiteSpace: 'nowrap'});
const donutRow = style({display: 'flex', alignItems: 'center', gap: 8, minHeight: 24, font: 'ui-sm', color: 'gray-800'});
const donutName = style({flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'});
const donutPct = style({width: 36, textAlign: 'end', color: 'gray-700'});
export function Donut({rows, total, caption}: {rows: Array<{name: string, value: number | null, text: string, color: SeriesColor}>, total: string, caption?: string}) {
  const [p, ref] = usePalette<HTMLDivElement>();
  // Every non-zero item is on the ring; minAngle keeps the 1% ones visible instead of reading as specks.
  const data = rows.filter(r => r.value !== null && r.value > 0);
  return (
    <div ref={ref} className={donutWrap}>
      <div className={donutBox}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{top: 0, right: 0, bottom: 0, left: 0}}>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={56} minAngle={6} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>{data.map(r => <Cell key={r.name} fill={p[r.color]} />)}</Pie>
            <Tooltip contentStyle={tipStyle(p)} itemStyle={{color: p.tipText}} formatter={(v, name, item) => [((item as {payload?: {text?: string}}).payload?.text ?? '') + '，' + String(v) + '%', String(name)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className={donutCenter}><span className={donutTotal}>{total}</span>{caption && <span className={donutSub}>{caption}</span>}</div>
      </div>
      <div className={donutList}>{rows.map(r => <div key={r.name} className={donutRow}><i className={swatch + ' ' + swatchClass[r.color]} /><span className={donutName}>{r.name}</span><span className={donutBytes}>{r.text}</span><span className={donutPct}>{r.value === null ? '—' : r.value + '%'}</span></div>)}</div>
    </div>
  );
}

// Ranked bar row (devices, node latency): label and value above a thin track, fill in the shared palette.
const barRow = style({display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flexGrow: 1});
const barTop = style({display: 'flex', justifyContent: 'space-between', gap: 12, font: 'ui-sm', color: 'gray-800'});
const barLabel = style({minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'});
const barVal = style({flexShrink: 0, color: 'gray-700'});
const track = style({height: 4, borderRadius: 'full', backgroundColor: 'gray-300', overflow: 'hidden'});
const fill = style({height: 'full', borderRadius: 'full', backgroundColor: {color: {accent: 'yellow-600', accent2: 'yellow-400', orange: 'gray-700', green: 'seafoam-600', purple: 'indigo-700', red: 'red-700', warn: 'orange-600', dark: 'gray-800', muted: 'gray-500', muted2: 'gray-400'}}});
export function BarRow({label, value, pct, color, icon}: {label: string, value: string, pct: number, color: SeriesColor, icon?: ReactNode}) {
  return <div className={barRow}><div className={barTop}><span className={barLabel}>{icon}{label}</span><span className={barVal}>{value}</span></div><div className={track}><div className={fill({color})} style={{width: `${Math.max(0, Math.min(100, pct))}%`}} /></div></div>;
}
