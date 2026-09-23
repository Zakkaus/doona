import type {ReactNode} from 'react';

// `icon` and `tint` as on the activity page's tiles: the icon takes a palette role colour, or the tone's.
export type ChartFact = {label: string; value: string; tone?: 'negative' | 'notice'; icon?: ReactNode; tint?: 'c1' | 'c2' | 'c3' | 'c4' | 'c5'};

// The page's figures as the activity page shows its own: a strip of tiles, label above, value large.
export function FactStrip({facts}: {facts: ChartFact[]}) {
  if (!facts.length) return null;
  return (
    <dl className="rp-strip rp-facts" style={{['--facts' as string]: facts.length}}>
      {facts.map(fact => (
        <div key={fact.label} className={'rp-card' + (fact.tone ? ' ' + fact.tone : '')}>
          <dt className={'rp-tile-head' + (fact.tint ? ' rp-tint-' + fact.tint : '')}>
            {fact.icon}
            {fact.label}
          </dt>
          <dd className="rp-tile-body">
            <span className="rp-big">{fact.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
