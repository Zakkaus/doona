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
// `href` is the rule's place in the rule list, built by the feature; without it the expression stands alone.
export function RuleRef({expression, href}: {expression: string | null; href?: string}) {
  const t = useT();
  if (!expression) return <>—</>;
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
// `mark` tags a member in place that is not the one selection, such as the member one network uses.
type NodeTileProps = {name: string; status: NodeStatus; description: string; current?: boolean; mark?: string};
export const latencyTone = (ms: number) => (ms < 100 ? 'ok' : ms < 180 ? 'warn' : 'err');
export function NodeTile({name, status, description, current, mark}: NodeTileProps) {
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
        {(mark || current) && <span className="cur">{mark ?? t('ui.current')}</span>}
      </span>
    </>
  );
}
