// Shared layout tokens and building blocks for the panel pages. One spacing scale everywhere:
// page sections 24, card padding 20 with inner gap 16, toolbar items 12, list rows 8, label to value 4.
import type {ReactNode} from 'react';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import {ToastQueue} from '@react-spectrum/s2/Toast';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {LabeledValue} from '@react-spectrum/s2/LabeledValue';
import {Text} from '@react-spectrum/s2/Text';
import type {Plane} from './mock';

export const page = style({display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0});
export const cards = style({display: 'grid', gridTemplateColumns: {default: ['repeat(2, minmax(0, 1fr))'], xl: ['repeat(4, minmax(0, 1fr))']}, gap: 16});
export const span2 = style({gridColumnEnd: 'span 2'});
export const tall = style({gridColumnEnd: 'span 2', gridRowEnd: {default: 'auto', xl: 'span 2'}});
export const card = style({
  backgroundColor: 'gray-75',
  borderRadius: 'lg',
  padding: 12,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0
});
export const cardHead = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32});
export const h3 = style({font: 'title', margin: 0});
export const label = style({font: 'detail'});
export const big = style({font: 'heading-xl', fontWeight: 'extra-bold'});
export const unit = style({font: 'detail', marginStart: 8});
export const stats = style({display: 'flex', alignItems: 'stretch', gap: 16});
export const stat = style({flexGrow: 1, flexBasis: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4});
export const statVal = style({font: 'title-lg', fontWeight: 'bold'});
export const row = style({display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'});
export const between = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'});
export const col = style({display: 'flex', flexDirection: 'column', gap: 16});
export const list = style({display: 'flex', flexDirection: 'column', gap: 8});
export const code = style({font: 'code-sm'});
export const inline = style({display: 'flex', alignItems: 'center', height: 'full'});
export const facts = style({
  display: 'grid',
  gridTemplateColumns: {default: ['repeat(2, minmax(0, 1fr))'], lg: ['repeat(3, minmax(0, 1fr))'], xl: ['repeat(5, minmax(0, 1fr))']},
  columnGap: 16,
  rowGap: 24
});
export const split = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], xl: ['minmax(0, 1fr)', 320]}, gap: 16, alignItems: 'start'});
export const note = style({font: 'body-sm', margin: 0});
export const kv = style({display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16});
export const toolbar = style({display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'});

// Code and log views: a framed block with a header bar, line numbers and horizontal scroll.
export const frame = style({borderWidth: 1, borderStyle: 'solid', borderColor: 'gray-300', borderRadius: 'lg', overflow: 'hidden', backgroundColor: 'base'});
export const frameHead = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 40,
  paddingX: 16,
  backgroundColor: 'gray-75',
  borderBottomWidth: 1,
  borderStyle: 'solid',
  borderColor: 'gray-300',
  font: 'detail'
});
export const frameBody = style({overflow: 'auto', paddingY: 12});
export const lineRow = style({
  display: 'grid',
  gridTemplateColumns: [56, 'max-content'],
  font: 'code',
  whiteSpace: 'pre',
  paddingEnd: 16,
  minHeight: 24,
  alignItems: 'center'
});
export const lineNum = style({textAlign: 'end', paddingEnd: 16, color: 'gray-600', userSelect: 'none'});
export const lineErr = style({backgroundColor: 'red-200'});
export const kw = style({color: 'red-900'});
export const arg = style({color: 'blue-900'});
export const str = style({color: 'orange-1000'});
export const cmt = style({color: 'gray-600'});
export const out = style({color: 'blue-900', fontWeight: 'bold'});
export const lvInfo = style({color: 'green-900', fontWeight: 'bold'});
export const lvWarn = style({color: 'orange-1000', fontWeight: 'bold'});
export const lvErr = style({color: 'red-900', fontWeight: 'bold'});

export const toast = (kind: 'positive' | 'negative' | 'neutral' | 'info', msg: string) => ToastQueue[kind](msg, {timeout: 5000});

export function Stat({k, v}: {k: string; v: string}) {
  return (
    <div className={stat}>
      <span className={label}>{k}</span>
      <span className={statVal}>{v}</span>
    </div>
  );
}
export function Big({v, u}: {v: string; u?: string}) {
  return (
    <div className={style({display: 'flex', alignItems: 'baseline'})}>
      <span className={big}>{v}</span>
      {u && <span className={unit}>{u}</span>}
    </div>
  );
}
export function Kv({items}: {items: Array<[string, string]>}) {
  return (
    <div className={kv}>
      {items.map(([k, v]) => (
        <LabeledValue key={k} label={k} value={v} />
      ))}
    </div>
  );
}
export function PlaneBadge({plane}: {plane: Plane}) {
  return <span>{plane}</span>;
}
export function Ready({ok, children}: {ok: boolean; children: string}) {
  return (
    <StatusLight variant={ok ? 'positive' : 'negative'} size="S">
      <Text>{children}</Text>
    </StatusLight>
  );
}
export function Frame({title, actions, children}: {title: ReactNode; actions?: ReactNode; children: ReactNode}) {
  return (
    <div className={frame}>
      <div className={frameHead}>
        <span>{title}</span>
        {actions}
      </div>
      <div className={frameBody}>{children}</div>
    </div>
  );
}
export function Line({n, err, children}: {n: number; err?: boolean; children: ReactNode}) {
  return (
    <div className={lineRow + (err ? ' ' + lineErr : '')}>
      <span className={lineNum}>{n}</span>
      {children}
    </div>
  );
}

// Minimal .dae highlighter: comments, section keywords, rule lines and fallback.
export function DaeLine({text}: {text: string}) {
  if (/^\s*#/.test(text)) return <span className={cmt}>{text}</span>;
  const sec = text.match(/^(\s*)(global|dns|upstream|routing|request|response|subscription|group|include|fallback)(\b.*)$/);
  if (sec && sec[2] === 'fallback') {
    const t = sec[3].match(/^: (\w+)$/);
    return (
      <span>
        {sec[1]}
        <span className={kw}>fallback</span>: <span className={out}>{t?.[1]}</span>
      </span>
    );
  }
  if (sec)
    return (
      <span>
        {sec[1]}
        <span className={kw}>{sec[2]}</span>
        {sec[3]}
      </span>
    );
  const r = text.match(/^(\s*)(.+?) -> (\w+)(\(must\))?$/);
  if (r)
    return (
      <span>
        {r[1]}
        <span className={arg}>{r[2]}</span> -&gt;{' '}
        <span className={out}>
          {r[3]}
          {r[4]}
        </span>
      </span>
    );
  const s = text.match(/^(\s*)([\w-]+): ('.*')$/);
  if (s)
    return (
      <span>
        {s[1]}
        {s[2]}: <span className={str}>{s[3]}</span>
      </span>
    );
  return <span>{text}</span>;
}
// Clash log line: level coloured, the rest verbatim.
export function LogLine({text}: {text: string}) {
  const m = text.match(/^\[(\w+)\]\s?(.*)$/);
  if (!m) return <span>{text}</span>;
  const cls = m[1] === 'WARN' ? lvWarn : m[1] === 'ERROR' ? lvErr : lvInfo;
  return (
    <span>
      <span className={cls}>{m[1].padEnd(5)}</span> {m[2]}
    </span>
  );
}
