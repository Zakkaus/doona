import type {ReactNode} from 'react';
import {Link as RLink} from 'react-aria-components';
import ListBulleted from './icons/ListBulleted';
import {useT} from '../i18n';
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

// A node's tile body: the name, one prepared status (a latency, a state or a badge) and a description line.
// The caller owns the container (a toggle button, a grid item or a plain card) and marks the current one.
export type NodeStatus = {text: string; tone?: 'ok' | 'warn' | 'err'; badge?: boolean};
export type NodeTileProps = {name: string; status: NodeStatus; description: string; current?: boolean};
export const latencyTone = (ms: number) => (ms < 100 ? 'ok' : ms < 180 ? 'warn' : 'err');
export function NodeTile({name, status, description, current}: NodeTileProps) {
  const t = useT();
  return (
    <>
      <span className="top">
        <span className="n">
          <TextTooltip>{name}</TextTooltip>
        </span>
        {status.badge ? <Badge>{status.text}</Badge> : <span className={cx('ms', status.tone)}>{status.text}</span>}
      </span>
      <span className="s">
        {description}
        {current && <span className="cur">{t('ui.current')}</span>}
      </span>
    </>
  );
}
