import type {ReactNode} from 'react';
import {NodeName} from '../NodeName';
import {TextTooltip} from '../Tooltip';
import {SkeletonStatus, useWaitAttr} from '../Feedback';

// `icon` and `tint` as on the activity page's tiles: the icon takes a palette role colour, or the tone's.
export type ChartFact = {
  label: string;
  value: string;
  nodeName?: boolean;
  caption?: string;
  valueRole?: 'name';
  tone?: 'negative' | 'notice';
  icon?: ReactNode;
  tint?: 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
};

// The page's figures as the activity page shows its own: a strip of tiles, label above, value large.
// `lead`: the first value is a name whose end tells most, as a host's domain. Wide, its tile takes two shares of the
// row; on a phone it takes the first row alone. At any width a name still too long for its tile gives way at its
// start, and a hover, keyboard focus or tap shows it whole. `loading`: the first values are on their way, and each is
// drawn as a Skeleton bar in its place under its label, with a caption's bar where the fact has one.
export function FactStrip({facts, lead, loading}: {facts: ChartFact[]; lead?: boolean; loading?: boolean}) {
  const wait = useWaitAttr();
  if (!facts.length) return null;
  return (
    <dl
      className={'rp-strip rp-facts' + (lead ? ' rp-facts-lead' : '')}
      style={{['--facts' as string]: facts.length, ['--facts-rest' as string]: facts.length - 1}}
      data-wait={loading ? wait : undefined}
    >
      {loading && <SkeletonStatus />}
      {facts.map((fact, i) => (
        <div key={fact.label} className={'rp-card' + (fact.tone ? ' ' + fact.tone : '') + (fact.valueRole === 'name' ? ' rp-fact-name' : '')}>
          <dt className={'rp-tile-head' + (fact.tint ? ' rp-tint-' + fact.tint : '')}>
            {fact.icon}
            {fact.label}
          </dt>
          <dd className="rp-tile-body">
            {loading ? (
              <>
                <span className="rp-big" inert aria-hidden="true">
                  <span className="rp-skeleton-text" />
                </span>
                {fact.caption && (
                  <span className="rp-fact-caption" inert aria-hidden="true">
                    <span className="rp-skeleton-text" />
                  </span>
                )}
              </>
            ) : fact.nodeName ? (
              <NodeName name={fact.value} className="rp-big" cut={fact.valueRole === 'name' ? undefined : lead && i === 0 ? 'start' : undefined} />
            ) : fact.valueRole === 'name' ? (
              <span className="rp-big">{fact.value}</span>
            ) : (
              <TextTooltip className="rp-big" cut={lead && i === 0 ? 'start' : undefined}>
                {fact.value}
              </TextTooltip>
            )}
            {!loading && fact.caption && <TextTooltip className="rp-fact-caption">{fact.caption}</TextTooltip>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
