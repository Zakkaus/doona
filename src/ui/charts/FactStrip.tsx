import type {ReactNode} from 'react';
import {TextTooltip} from '../Button';
import {phoneQuery, useMediaQuery} from '../hooks';

// `icon` and `tint` as on the activity page's tiles: the icon takes a palette role colour, or the tone's.
export type ChartFact = {
  label: string;
  value: string;
  caption?: string;
  tone?: 'negative' | 'notice';
  icon?: ReactNode;
  tint?: 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
};

// The page's figures as the activity page shows its own: a strip of tiles, label above, value large.
// `lead`: the first value is a name whose end tells most, as a host's domain. On a phone its tile takes the first row
// alone, and a name still too long for it gives way at its start; a hover, keyboard focus or tap shows it whole.
export function FactStrip({facts, lead}: {facts: ChartFact[]; lead?: boolean}) {
  const phone = useMediaQuery(phoneQuery);
  if (!facts.length) return null;
  return (
    <dl className={'rp-strip rp-facts' + (lead ? ' rp-facts-lead' : '')} style={{['--facts' as string]: facts.length}}>
      {facts.map((fact, i) => (
        <div key={fact.label} className={'rp-card' + (fact.tone ? ' ' + fact.tone : '')}>
          <dt className={'rp-tile-head' + (fact.tint ? ' rp-tint-' + fact.tint : '')}>
            {fact.icon}
            {fact.label}
          </dt>
          <dd className="rp-tile-body">
            {lead && phone && i === 0 ? (
              <TextTooltip className="rp-big" cut="start">
                {fact.value}
              </TextTooltip>
            ) : (
              <span className="rp-big" title={fact.value}>
                {fact.value}
              </span>
            )}
            {fact.caption && (
              <span className="rp-fact-caption" title={fact.caption}>
                {fact.caption}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
