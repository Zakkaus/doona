import type {ReactNode} from 'react';
// Flag glyphs for the regions geo.ts can recognise, inlined from flag-icons (MIT) so the panel stays offline.
// Rendered as a small rounded 4:3 tile with a hairline so light flags (Japan, Singapore) keep an edge.
import {regionOf} from './geo';
import f_hk from 'flag-icons/flags/4x3/hk.svg?raw';
import f_tw from 'flag-icons/flags/4x3/tw.svg?raw';
import f_jp from 'flag-icons/flags/4x3/jp.svg?raw';
import f_sg from 'flag-icons/flags/4x3/sg.svg?raw';
import f_kr from 'flag-icons/flags/4x3/kr.svg?raw';
import f_us from 'flag-icons/flags/4x3/us.svg?raw';
import f_ca from 'flag-icons/flags/4x3/ca.svg?raw';
import f_gb from 'flag-icons/flags/4x3/gb.svg?raw';
import f_de from 'flag-icons/flags/4x3/de.svg?raw';
import f_fr from 'flag-icons/flags/4x3/fr.svg?raw';
import f_nl from 'flag-icons/flags/4x3/nl.svg?raw';
import f_ru from 'flag-icons/flags/4x3/ru.svg?raw';
import f_au from 'flag-icons/flags/4x3/au.svg?raw';
import f_in from 'flag-icons/flags/4x3/in.svg?raw';
import f_tr from 'flag-icons/flags/4x3/tr.svg?raw';
import f_br from 'flag-icons/flags/4x3/br.svg?raw';
import f_ar from 'flag-icons/flags/4x3/ar.svg?raw';
import f_my from 'flag-icons/flags/4x3/my.svg?raw';
import f_th from 'flag-icons/flags/4x3/th.svg?raw';
import f_vn from 'flag-icons/flags/4x3/vn.svg?raw';
import f_ph from 'flag-icons/flags/4x3/ph.svg?raw';
import f_id from 'flag-icons/flags/4x3/id.svg?raw';
import f_ae from 'flag-icons/flags/4x3/ae.svg?raw';
import f_ch from 'flag-icons/flags/4x3/ch.svg?raw';
import f_se from 'flag-icons/flags/4x3/se.svg?raw';
import f_fi from 'flag-icons/flags/4x3/fi.svg?raw';
import f_it from 'flag-icons/flags/4x3/it.svg?raw';
import f_es from 'flag-icons/flags/4x3/es.svg?raw';
import f_pl from 'flag-icons/flags/4x3/pl.svg?raw';
import f_mo from 'flag-icons/flags/4x3/mo.svg?raw';
import f_cn from 'flag-icons/flags/4x3/cn.svg?raw';

const FLAGS: Record<string, string> = {
  HK: f_hk,
  TW: f_tw,
  JP: f_jp,
  SG: f_sg,
  KR: f_kr,
  US: f_us,
  CA: f_ca,
  GB: f_gb,
  DE: f_de,
  FR: f_fr,
  NL: f_nl,
  RU: f_ru,
  AU: f_au,
  IN: f_in,
  TR: f_tr,
  BR: f_br,
  AR: f_ar,
  MY: f_my,
  TH: f_th,
  VN: f_vn,
  PH: f_ph,
  ID: f_id,
  AE: f_ae,
  CH: f_ch,
  SE: f_se,
  FI: f_fi,
  IT: f_it,
  ES: f_es,
  PL: f_pl,
  MO: f_mo,
  CN: f_cn
};

export function flagSvg(name: string): string | null {
  const r = regionOf(name);
  return r ? (FLAGS[r] ?? null) : null;
}
export function Flag({name, className}: {name: string; className?: string}) {
  const svg = flagSvg(name);
  if (!svg) return null;
  return <span className={className ?? 'flag'} role="img" aria-label={regionOf(name) ?? ''} dangerouslySetInnerHTML={{__html: svg}} />;
}

// Built-in outbounds and policy groups get a mark in the flag's frame, so a chain reads the same whether it
// ends in a node or not. Each glyph says what the thing does: an arrow straight through for direct, a barred
// circle for block, and for groups the way they pick a member.
export type MarkKind = 'direct' | 'block' | 'unknown' | 'node' | 'selector' | 'urltest' | 'fallback' | 'loadbalance' | 'random' | 'score';
const stroke = {fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'} as const;
const glyphs: Record<MarkKind, ReactNode> = {
  // straight through
  direct: <path d="M3 6h10M10 3l3 3-3 3" {...stroke} />,
  // barred circle
  block: <path d="M8 2.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2M5.5 3.5l5 5" {...stroke} />,
  // dashed ring
  unknown: <circle cx="8" cy="6" r="3.6" {...stroke} strokeDasharray="2 1.6" />,
  // one node
  node: <path d="M8 1.8L12.2 6 8 10.2 3.8 6z" fill="currentColor" />,
  // a list with one row picked by hand
  selector: (
    <g {...stroke}>
      <path d="M7.5 3.8H13M7.5 8.2H13" />
      <circle cx="4.2" cy="3.8" r="1.5" fill="currentColor" />
      <circle cx="4.2" cy="8.2" r="1.2" />
    </g>
  ),
  // a gauge: the fastest wins
  urltest: (
    <g {...stroke}>
      <path d="M3 9a5 5 0 0 1 10 0" />
      <path d="M8 9l3-3.6" />
      <circle cx="8" cy="9" r="0.9" fill="currentColor" />
    </g>
  ),
  // steps: the next one down when the first fails
  fallback: <path d="M3 3h3.3v3H9.6v3H13" {...stroke} />,
  // crossing paths: traffic spread over members
  loadbalance: <path d="M3 3.5h3l4 5h3M3 8.5h3l4-5h3M11.5 2l1.5 1.5-1.5 1.5M11.5 7l1.5 1.5-1.5 1.5" {...stroke} />,
  random: <path d="M3 3.5h3l4 5h3M3 8.5h3l4-5h3M11.5 2l1.5 1.5-1.5 1.5M11.5 7l1.5 1.5-1.5 1.5" {...stroke} />,
  // a podium: ranked by score
  score: <path d="M3.5 10V6M7 10V2.5M10.5 10V7.5M2.5 10h11" {...stroke} />
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
// The mark for a policy group, by how it picks its member; unknown kinds fall back to the plain node mark.
export function PolicyMark({kind, className}: {kind: string | null | undefined; className?: string}) {
  const known = kind && kind in glyphs && !['direct', 'block', 'unknown', 'node'].includes(kind) ? (kind as MarkKind) : 'node';
  return <Mark kind={known} className={className} />;
}
export function OutboundMark({name, className}: {name: string | null; className?: string}) {
  if (name === 'direct' || name === 'block' || name === null || name === 'unknown')
    return <Mark kind={name === 'direct' ? 'direct' : name === 'block' ? 'block' : 'unknown'} className={className} />;
  if (!flagSvg(name)) return <Mark kind="node" className={className} />;
  return <Flag name={name} className={className} />;
}
