// Recharts drawn with the Rosé Pine variables (read from the document so they follow the theme switch).
import {useEffect, useId, useState} from 'react';
import {AreaChart as RAreaChart, Area, PieChart, Pie, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';

export type Series = {label: string, color: string, values: number[]};
const VARS = ['base', 'surface', 'overlay', 'muted', 'subtle', 'text', 'love', 'gold', 'rose', 'pine', 'foam', 'iris', 'hl-low', 'hl-med', 'hl-high'] as const;
export type Palette = Record<typeof VARS[number], string> & {vivid: boolean};
function read(): Palette {
  const cs = getComputedStyle(document.documentElement);
  return {...Object.fromEntries(VARS.map(v => [v, cs.getPropertyValue('--rp-' + v).trim()])), vivid: document.documentElement.dataset.colour !== 'mono'} as Palette;
}
export function usePalette() {
  const [p, setP] = useState<Palette>(() => read());
  useEffect(() => {
    const mo = new MutationObserver(() => setP(read()));
    mo.observe(document.documentElement, {attributes: true, attributeFilter: ['data-family', 'data-flavour', 'data-scheme', 'data-colour']});
    return () => mo.disconnect();
  }, []);
  return p;
}
export const fmtRate = (kb: number) => kb >= 1000 ? (kb / 1000).toFixed(kb >= 10000 || kb % 1000 === 0 ? 0 : 1) + ' MB/s' : Math.round(kb) + ' KB/s';
const niceMax = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10; return s * p; };
const clock = (msAgo: number) => { const d = new Date(Date.now() - msAgo); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const tip = (p: Palette) => ({backgroundColor: p.text, color: p.surface, border: 'none', borderRadius: 8, fontSize: 12, padding: '8px 12px'});

export function Legend({series, fmt}: {series: Series[], fmt: (v: number) => string}) {
  return <div className="rp-legend">{series.map(s => <span key={s.label} className="it"><i className="sw" style={{background: s.color}} />{s.label} <b>{fmt(s.values[s.values.length - 1])}</b></span>)}</div>;
}
export function AreaChart({series, fmt, height = 150, step = 10_000}: {series: Series[], fmt: (v: number) => string, height?: number, step?: number}) {
  const p = usePalette(); const uid = useId();
  const n = series[0].values.length, last = n - 1;
  const data = Array.from({length: n}, (_, i) => Object.fromEntries([['t', clock((last - i) * step)], ...series.map(s => [s.label, s.values[i]])]));
  const max = niceMax(Math.max(...series.flatMap(s => s.values)) * 1.08);
  const ticks = [0, Math.round(last / 3), Math.round((2 * last) / 3), last].map(i => data[i].t as string);
  return (
    <div style={{height, width: '100%'}}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={data} margin={{top: 8, right: 0, bottom: 0, left: 20}}>
          <defs>{series.map((s, k) => <linearGradient key={s.label} id={uid + k} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.35} /><stop offset="100%" stopColor={s.color} stopOpacity={0.03} /></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke={p['hl-med']} strokeDasharray="2 4" />
          <XAxis dataKey="t" ticks={ticks} tick={{fontSize: 11, fill: p.subtle}} axisLine={false} tickLine={false} interval={0} />
          <YAxis orientation="right" ticks={[max / 2, max]} domain={[0, max]} tickFormatter={v => fmt(v)} tick={{fontSize: 11, fill: p.subtle}} axisLine={false} tickLine={false} width={64} />
          <Tooltip contentStyle={tip(p)} itemStyle={{color: p.surface}} formatter={v => fmt(Number(v))} cursor={{stroke: p.subtle, strokeDasharray: '3 3'}} />
          {series.map((s, k) => <Area key={s.label} type="monotone" dataKey={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${uid + k})`} dot={false} activeDot={{r: 4, strokeWidth: 2}} isAnimationActive={false} />)}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Spark({values, color, height = 32}: {values: number[], color: string, height?: number}) {
  const uid = useId();
  const data = values.map((v, i) => ({i, v}));
  const lo = Math.min(...values) * 0.85, hi = Math.max(...values) * 1.05 || 1;
  return (
    <div style={{height, width: '100%'}}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={data} margin={{top: 2, right: 0, bottom: 2, left: 0}}>
          <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0.03} /></linearGradient></defs>
          <YAxis hide domain={[lo, hi]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${uid})`} dot={false} isAnimationActive={false} />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Donut({rows, total}: {rows: Array<{name: string, value: number, text: string, color: string}>, total: string}) {
  const p = usePalette();
  const data = rows.filter(r => r.value > 0);
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
      <div className="lst">{rows.map(r => <div key={r.name} className="r"><i className="dot" style={{background: r.color}} /><span className="n">{r.name}</span><span>{r.text}</span><span className="p">{r.value}%</span></div>)}</div>
    </div>
  );
}
