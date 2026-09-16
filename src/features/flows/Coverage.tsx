import {useT, useLang, formatList} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {FlowList} from '../../api/model';
import {Badge, TextTooltip} from '../../ui/ui';

const scopes: Record<string, Key> = {
  userspace_tcp: 'flow.userspaceTcp',
  userspace_udp: 'flow.userspaceUdp',
  kernel_direct: 'flow.kernelDirect',
  kernel_block: 'flow.kernelBlock',
  dns_intercept: 'flow.dnsIntercept',
  kernel_bypass: 'flow.kernelBypass'
};
const visibility: Record<string, Key> = {full: 'flow.full', partial: 'flow.partialVisibility', none: 'ui.none', unknown: 'ui.unknown'};

// Full coverage is the normal case and says nothing; anything less folds into one badge with the detail on hover.
export function Coverage({data}: {data: Pick<FlowList, 'coverage' | 'dropped_records'>}) {
  const t = useT();
  const lang = useLang();
  const partial = Object.entries(data.coverage).filter(([, value]) => value !== 'full');
  const dropped = data.dropped_records !== null && BigInt(data.dropped_records) > 0n;
  if (!partial.length && !dropped) return null;
  const detail = formatList(
    lang,
    partial.map(([scope, value]) => t('ui.valuePair', {label: scopes[scope] ? t(scopes[scope]) : scope, value: t(visibility[value])}))
  );
  return (
    <div className="rp-cluster" role="group" aria-label={t('flow.coverage')}>
      {partial.length > 0 && (
        <TextTooltip text={detail}>
          <Badge tone="warn">{t('flow.coverageSummary', {n: partial.length})}</Badge>
        </TextTooltip>
      )}
      {dropped && <Badge tone="warn">{t('flow.dropped', {n: data.dropped_records ?? 0})}</Badge>}
    </div>
  );
}
