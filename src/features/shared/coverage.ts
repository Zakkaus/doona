import type {FlowList} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {formatList, type Key, type Lang, type Translator} from '../../i18n';
import {parseU64} from '../../api/u64';

// How much of the traffic the flow records see, shown beside every listing that counts them.
const scopes: Record<string, Key> = {
  userspace_tcp: 'flow.userspaceTcp',
  userspace_udp: 'flow.userspaceUdp',
  kernel_direct: 'flow.kernelDirect',
  kernel_block: 'flow.kernelBlock',
  dns_intercept: 'flow.dnsIntercept',
  kernel_bypass: 'flow.kernelBypass'
};
const visibility: Record<string, Key> = {full: 'flow.full', partial: 'flow.partialVisibility', none: 'ui.none'};
export type CoverageView = {summary: string | null; detail: string; dropped: string | null};
export function coverageView(data: Pick<FlowList, 'coverage' | 'dropped_records'>, t: Translator, lang: Lang): CoverageView | null {
  const partial = Object.entries(data.coverage).filter(([, value]) => value !== 'full');
  const count = parseU64(data.dropped_records);
  const dropped = count ? t('flow.dropped', {n: count}) : null;
  if (!partial.length && !dropped) return null;
  return {
    summary: partial.length ? t('flow.coverageSummary', {n: partial.length}) : null,
    detail: formatList(
      lang,
      partial.map(([scope, value]) => t('ui.valuePair', {label: enumLabel(scopes, scope, t), value: enumLabel(visibility, value, t)}))
    ),
    dropped
  };
}
