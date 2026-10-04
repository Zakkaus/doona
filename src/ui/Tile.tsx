import type {ReactNode} from 'react';
import {Link as RLink} from 'react-aria-components';
import ListBulleted from './icons/ListBulleted';
import {useT} from '../i18n';
import {cx} from './cx';
import {TextTooltip} from './Tooltip';
import {NodeName} from './NodeName';
import {Badge} from './Feedback';
import {TileHead, type TileHeader} from './Card';

// A tile that opens a page; `tile` captions it with its label.
export function CardLink({href, label, tile, children}: {href: string; label: string; tile?: Omit<TileHeader, 'kind'>; children: ReactNode}) {
  return (
    <RLink href={href} aria-label={label} className="rp-card rp-card-link">
      {tile && <TileHead {...tile} kind="metric" label={label} />}
      {children}
    </RLink>
  );
}
// A metric tile's body: its value, then its sparkline or the `status` that takes its place, side by side or stacked as
// its dashboard row lays out its tiles (see packSection). `children` stand in for both until the value is known.
export function ValueTile({value, spark, status, children}: {value?: ReactNode; spark?: ReactNode; status?: ReactNode; children?: ReactNode}) {
  return (
    <div className="rp-tile-body" data-pack="tile">
      {children || (
        <>
          <span className="rp-tile-val">{value}</span>
          {status || (spark && <span className="rp-spark">{spark}</span>)}
        </>
      )}
    </div>
  );
}
// `href` is the rule's place in the rule list, built by the feature; without it the expression stands alone. `tooltip`
// replaces the expression in the tooltip, and `className` styles the expression.
export function RuleRef({expression, href, tooltip, className}: {expression: string | null; href?: string; tooltip?: string; className?: string}) {
  const t = useT();
  if (!expression) return <>—</>;
  return (
    <>
      <TextTooltip className={className} text={tooltip ?? expression}>
        {expression}
      </TextTooltip>
      {href && (
        <RLink href={href} className="rp-btn quiet icon rp-rule-link" aria-label={t('ui.openRule', {rule: expression})}>
          <ListBulleted />
        </RLink>
      )}
    </>
  );
}

// A node's tile body: the name, one prepared status (a latency or a state, after an optional badge) and a description
// line. An empty status text shows the badge alone.
// The caller owns the container (a toggle button, a grid item or a plain card) and marks the current one.
export type NodeStatus = {text: string; tone?: 'ok' | 'warn' | 'err'; badge?: string};
// `mark` tags a member in place that is not the one selection, such as the member one network uses.
type NodeTileProps = {name: string; nodeName: boolean; status: NodeStatus; description: string; current?: boolean; mark?: string};
// A measured latency is green below 100 ms, yellow below 300 ms and red from there; a node that did not answer is red too.
export const latencyTone = (ms: number): 'ok' | 'warn' | 'err' => (ms < 100 ? 'ok' : ms < 300 ? 'warn' : 'err');
export function NodeTile({name, nodeName, status, description, current, mark}: NodeTileProps) {
  const t = useT();
  return (
    <>
      <span className="top">
        <span className="n">{nodeName ? <NodeName name={name} /> : <TextTooltip>{name}</TextTooltip>}</span>
        {status.badge && <Badge>{status.badge}</Badge>}
        {status.text && <span className={cx('ms', status.tone)}>{status.text}</span>}
      </span>
      <span className="s">
        {description}
        {(mark || current) && <span className="cur">{mark ?? t('ui.current')}</span>}
      </span>
    </>
  );
}
