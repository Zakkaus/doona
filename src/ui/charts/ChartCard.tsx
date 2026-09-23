import {useId, type ReactNode} from 'react';
import {ChartDescription} from './description';

export type ChartFact = {label: string; value: string; tone?: 'negative' | 'notice'};

// The page's figures as the activity page shows its own: a strip of tiles, label above, value large.
export function FactStrip({facts}: {facts: ChartFact[]}) {
  if (!facts.length) return null;
  return (
    <dl className="rp-strip rp-facts" style={{['--facts' as string]: facts.length}}>
      {facts.map(fact => (
        <div key={fact.label} className={'rp-card' + (fact.tone ? ' ' + fact.tone : '')}>
          <dt className="rp-tile-head">{fact.label}</dt>
          <dd className="rp-tile-body">
            <span className="rp-big">{fact.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// One module of a page: a card with its title, an optional note on what it is drawn from, then the chart, which the
// note describes to assistive technology.
export function ChartCard({title, note, aside, children}: {title: string; note?: string; aside?: ReactNode; children: ReactNode}) {
  const titleId = useId();
  const noteId = useId();
  return (
    <section className="rp-card rp-chartcard" aria-labelledby={titleId}>
      <div className="rp-row">
        <h3 className="rp-h3" id={titleId}>
          {title}
        </h3>
        {aside}
      </div>
      {note && (
        <p className="rp-note" id={noteId}>
          {note}
        </p>
      )}
      <ChartDescription.Provider value={note ? noteId : undefined}>{children}</ChartDescription.Provider>
    </section>
  );
}
