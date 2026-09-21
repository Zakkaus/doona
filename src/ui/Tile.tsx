import type {ReactNode} from 'react';
import {Link as RLink, ToggleButton} from 'react-aria-components';
import ListBulleted from './icons/ListBulleted';
import {useT} from '../i18n';
import {millis} from '../api/u64';
import {cx} from './cx';
import {TextTooltip} from './Button';
import {Badge} from './Feedback';

export function CardLink({href, label, children}: {href: string; label: string; children: ReactNode}) {
  return (
    <RLink href={href} aria-label={label} className="rp-card rp-card-link">
      {children}
    </RLink>
  );
}
export function RuleRef({expression, ruleId, linked}: {expression: string | null; ruleId: string | null; linked: boolean}) {
  const t = useT();
  if (!expression) return <>—</>;
  const href = linked && ruleId ? '#/rules?tab=list&rule=' + encodeURIComponent(ruleId) : undefined;
  return (
    <>
      <TextTooltip text={expression}>{expression}</TextTooltip>
      {href && (
        <RLink href={href} className="rp-btn quiet icon rp-rule-link" aria-label={t('ui.openRule', {rule: expression})}>
          <ListBulleted />
        </RLink>
      )}
    </>
  );
}

export type NodeTileProps = {
  name: string;
  tcp?: number;
  alive?: boolean;
  unavailable?: boolean;
  description?: string;
  nested?: boolean;
  selected?: boolean;
  cur?: boolean;
  onPress?: () => void;
  isDisabled?: boolean;
  bodyOnly?: boolean;
};
export const latencyTone = (ms: number) => (ms < 100 ? 'ok' : ms < 180 ? 'warn' : 'err');
export function NodeTile({
  name,
  tcp,
  alive = true,
  unavailable = !alive || tcp == null,
  description,
  nested,
  selected,
  cur,
  onPress,
  isDisabled,
  bodyOnly
}: NodeTileProps) {
  const t = useT();
  const latency = tcp == null ? '' : t('ui.latency', {n: millis(tcp)});
  const body = (
    <>
      <span className="top">
        <span className="n">
          <TextTooltip>{name}</TextTooltip>
        </span>
        {nested ? (
          <Badge>{t('ui.group')}</Badge>
        ) : alive && tcp != null ? (
          <span className={cx('ms', latencyTone(tcp))}>{latency}</span>
        ) : (
          <span className={cx('ms', unavailable && 'err')}>{unavailable ? t('ui.unavailable') : '—'}</span>
        )}
      </span>
      <span className="s">
        {description ?? ' '}
        {cur && !onPress && <span className="cur">{t('ui.current')}</span>}
      </span>
    </>
  );
  if (bodyOnly) return body;
  if (onPress) {
    return (
      <ToggleButton className="rp-node" isSelected={selected} isDisabled={isDisabled} onChange={onPress}>
        {body}
      </ToggleButton>
    );
  }
  return <div className={cx('rp-node', cur && 'cur')}>{body}</div>;
}
