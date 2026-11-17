import {useCallback, type ReactNode} from 'react';
import {NodeName} from '../NodeName';
import {TextTooltip} from '../Tooltip';
import {useWaitAttr} from '../Empty';
import {SkeletonStatus} from '../Skeleton';

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
// drawn as a Skeleton bar in its place under its label, with a caption's bar where the fact has one. `fit`: the facts
// share one row while each keeps its text whole in an equal share, and pair up otherwise (data-pairs, see
// dashboard.css), as measured from the strip's own width and its facts' text whenever either changes.
export function FactStrip({facts, lead, loading, fit}: {facts: ChartFact[]; lead?: boolean; loading?: boolean; fit?: boolean}) {
  const wait = useWaitAttr(!!loading);
  const fitRef = useCallback((strip: HTMLDListElement | null) => {
    if (!strip) return;
    const measure = () => {
      const columns = strip.style.gridTemplateColumns;
      strip.style.gridTemplateColumns = `repeat(${strip.children.length}, max-content)`;
      const widest = Math.max(0, ...[...strip.children].map(fact => fact.getBoundingClientRect().width));
      strip.style.gridTemplateColumns = columns;
      const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
      strip.toggleAttribute('data-pairs', strip.children.length * (widest + gap) - gap > strip.clientWidth + 0.5);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(strip);
    const text = new MutationObserver(measure);
    text.observe(strip, {subtree: true, childList: true, characterData: true});
    void document.fonts?.ready.then(measure);
    return () => {
      resize.disconnect();
      text.disconnect();
    };
  }, []);
  if (!facts.length) return null;
  return (
    <dl
      ref={fit ? fitRef : undefined}
      className={'rp-strip rp-facts' + (lead ? ' rp-facts-lead' : '')}
      style={{['--facts' as string]: facts.length, ['--facts-rest' as string]: facts.length - 1}}
      data-wait={loading ? wait : undefined}
    >
      {facts.map((fact, i) => (
        <div key={fact.label} className={'rp-card' + (fact.tone ? ' ' + fact.tone : '') + (fact.valueRole === 'name' ? ' rp-fact-name' : '')}>
          <dt className={'rp-tile-head' + (fact.tint ? ' rp-tint-' + fact.tint : '')}>
            {fact.icon}
            {fact.label}
          </dt>
          <dd className="rp-tile-body">
            {loading ? (
              <>
                {/* Inside the first tile, so the strip's own children are its tiles alone, as its layout counts them. */}
                {!i && <SkeletonStatus />}
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
