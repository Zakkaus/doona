import {useId, type ReactNode} from 'react';
import {ChartDescription} from './description';

export type ChartFact = {label: string; value: string; tone?: 'negative' | 'notice'};

// A chart card leads with its title and the facts the chart shows, label by label, so the card reads without the
// chart; the sample line says what it is drawn from. Charts inside are described by both.
export function ChartCard({title, facts, sample, children}: {title: string; facts: ChartFact[]; sample?: string; children?: ReactNode}) {
  const titleId = useId();
  const factsId = useId();
  const sampleId = useId();
  return (
    <section className="rp-card rp-chartcard" aria-labelledby={titleId}>
      <h3 className="rp-h3" id={titleId}>
        {title}
      </h3>
      {facts.length > 0 && (
        <dl className="rp-facts" id={factsId}>
          {facts.map(fact => (
            <div key={fact.label} className={fact.tone}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {sample && (
        <p className="rp-note" id={sampleId}>
          {sample}
        </p>
      )}
      {children && (
        <ChartDescription.Provider value={[facts.length ? factsId : '', sample ? sampleId : ''].filter(Boolean).join(' ') || undefined}>
          <div className="rp-chartcard-body">{children}</div>
        </ChartDescription.Provider>
      )}
    </section>
  );
}
