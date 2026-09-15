// Recharts drawn with the Rosé Pine variables (read from the document so they follow the theme switch).
import {useEffect, useId, useState} from 'react';
import {AreaChart as RAreaChart, Area, PieChart, Pie, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';

export type Series = {label: string, color: string, values: Array<number | null>};
const VARS = ['base', 'surface', 'overlay', 'muted', 'subtle', 'text', 'love', 'gold', 'rose', 'pine', 'foam', 'iris', 'hl-low', 'hl-med', 'hl-high'] as const;
export type Palette = Record<typeof VARS[number], string> & {cat: string[]};
function read(): Palette {
  const cs = getComputedStyle(document.documentElement);
  return {...Object.fromEntries(VARS.map(v => [v, cs.getPropertyValue('--rp-' + v).trim()])), cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => cs.getPropertyValue('--rp-c' + i).trim())} as Palette;
}
export function usePalette() {
  const [p, setP] = useState<Palette>(() => read());
  useEffect(() => {
    const mo = new MutationObserver(() => setP(read()));
    setP(read()); // the shell stamps the palette attributes in a layout effect, before this observer exists
    mo.observe(document.documentElement, {attributes: true, attributeFilter: ['data-family', 'data-flavour', 'data-scheme']});
    return () => mo.disconnect();
  }, []);
  return p;
}
export const fmtRate = (kb: number | null | undefined) => kb == null ? '—' : kb >= 1000 ? (kb / 1000).toFixed(kb >= 10000 || kb % 1000 === 0 ? 0 : 1) + ' MB/s' : Math.round(kb) + ' KB/s';
const niceMax = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10; return s * p; };
const clock = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
const tip = (p: Palette) => ({backgroundColor: p.text, color: p.surface, border: 'none', borderRadius: 8, fontSize: 12, padding: '8px 12px'});

export function Legend({series, fmt}: {series: Series[], fmt: (v: number | null | undefined) => string}) {
  return <div className="rp-legend">{series.map(s => <span key={s.label} className="it"><i className="sw" style={{background: s.color}} />{s.label} <b>{fmt(s.values[s.values.length - 1])}</b></span>)}</div>;
}
export function AreaChart({series, timestamps, fmt, height = 150}: {series: Series[], timestamps: number[], fmt: (v: number) => string, height?: number}) {
  const p = usePalette(); const uid = useId();
  if (!timestamps.length) return null;
  const last = timestamps.length - 1;
  const data = timestamps.map((t, i) => Object.fromEntries([['t', t], ...series.map(s => [s.label, s.values[i]])]));
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values.filter((v): v is number => v !== null))) * 1.08);
  const ticks = [...new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last].map(i => timestamps[i]))];
  return (
    <div style={{height, width: '100%'}}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={data} margin={{top: 8, right: 0, bottom: 0, left: 20}}>
          <defs>{series.map((s, k) => <linearGradient key={s.label} id={uid + k} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.35} /><stop offset="100%" stopColor={s.color} stopOpacity={0.03} /></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke={p['hl-med']} strokeDasharray="2 4" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={clock} tick={{fontSize: 11, fill: p.subtle}} axisLine={false} tickLine={false} interval={0} />
          <YAxis orientation="right" ticks={[max / 2, max]} domain={[0, max]} tickFormatter={v => fmt(v)} tick={{fontSize: 11, fill: p.subtle}} axisLine={false} tickLine={false} width={64} />
          <Tooltip contentStyle={tip(p)} itemStyle={{color: p.surface}} labelFormatter={value => new Date(Number(value)).toLocaleString()} formatter={v => fmt(Number(v))} cursor={{stroke: p.subtle, strokeDasharray: '3 3'}} />
          {series.map((s, k) => <Area key={s.label} type="monotone" dataKey={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${uid + k})`} dot={false} activeDot={{r: 4, strokeWidth: 2}} isAnimationActive={false} />)}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Spark({values, timestamps, color, height = 32}: {values: Array<number | null>, timestamps: number[], color: string, height?: number}) {
  const uid = useId();
  const known = values.filter((v): v is number => v !== null);
  if (!known.length) return null;
  const data = values.map((v, i) => ({t: timestamps[i], v}));
  const lo = Math.min(...known) * 0.85, hi = Math.max(...known) * 1.05 || 1;
  return (
    <div style={{height, width: '100%'}}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={data} margin={{top: 2, right: 0, bottom: 2, left: 0}}>
          <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0.03} /></linearGradient></defs>
          <XAxis hide dataKey="t" type="number" domain={['dataMin', 'dataMax']} />
          <YAxis hide domain={[lo, hi]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${uid})`} dot={false} isAnimationActive={false} />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Donut({rows, total}: {rows: Array<{name: string, value: number | null, text: string, color: string}>, total: string}) {
  const p = usePalette();
  const data = rows.filter(r => r.value !== null && r.value > 0);
  return (
    <div className="rp-donut">
      <div className="box">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{top: 0, right: 0, bottom: 0, left: 0}}>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={56} minAngle={6} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>{data.map(r => <Cell key={r.name} fill={r.color} />)}</Pie>
            <Tooltip contentStyle={tip(p)} itemStyle={{color: p.surface}} formatter={(v, name, item) => [((item as {payload?: {text?: string}}).payload?.text ?? '') + '，' + String(v) + '%', String(name)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="center">{total}</div>
      </div>
      <div className="lst">{rows.map(r => <div key={r.name} className="r"><i className="dot" style={{background: r.color}} /><span className="n">{r.name}</span><span>{r.text}</span><span className="p">{r.value === null ? '—' : r.value + '%'}</span></div>)}</div>
    </div>
  );
}
