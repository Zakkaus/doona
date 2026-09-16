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

// Built-in outbounds get a mark in the flag's frame, so a chain reads the same whether it ends in a node or not.
export function OutboundMark({name, className}: {name: string | null; className?: string}) {
  if (name === 'direct' || name === 'block' || name === null || name === 'unknown') {
    const kind = name === 'direct' ? 'direct' : name === 'block' ? 'block' : 'unknown';
    return (
      <span className={(className ?? 'flag') + ' mark'} data-kind={kind} role="img" aria-hidden="true">
        {kind === 'direct' ? '⇄' : kind === 'block' ? '⊘' : '?'}
      </span>
    );
  }
  return <Flag name={name} className={className} />;
}
