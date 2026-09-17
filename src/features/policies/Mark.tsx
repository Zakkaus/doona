import type {ReactNode} from 'react';

// Built-in outbounds get a mark, so a chain reads the same whether it ends in a node or not: an arrow straight
// through for direct, a barred circle for block, a dashed ring for unknown, a diamond for a node.
export type MarkKind = 'direct' | 'block' | 'unknown' | 'node';
const stroke = {fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'} as const;
const glyphs: Record<MarkKind, ReactNode> = {
  // straight through
  direct: <path d="M3 6h10M10 3l3 3-3 3" {...stroke} />,
  // barred circle
  block: <path d="M8 2.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2M5.5 3.5l5 5" {...stroke} />,
  // dashed ring
  unknown: <circle cx="8" cy="6" r="3.6" {...stroke} strokeDasharray="2 1.6" />,
  // one node
  node: <path d="M8 1.8L12.2 6 8 10.2 3.8 6z" fill="currentColor" />
};
function Mark({kind, className}: {kind: MarkKind; className?: string}) {
  return (
    <span className={(className ?? 'flag') + ' mark'} data-kind={kind} role="img" aria-hidden="true">
      <svg viewBox="0 0 16 12" width="16" height="12">
        {glyphs[kind]}
      </svg>
    </span>
  );
}
export function OutboundMark({name, className}: {name: string | null; className?: string}) {
  if (name === 'direct' || name === 'block' || name === null || name === 'unknown')
    return <Mark kind={name === 'direct' ? 'direct' : name === 'block' ? 'block' : 'unknown'} className={className} />;
  return <Mark kind="node" className={className} />;
}
