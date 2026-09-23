import {useId, type ReactNode, type Ref} from 'react';
import {ChartDescription} from './charts/description';

// A titled card: the title with an optional control beside it (a toggle, a link), an optional note on what the card
// is drawn from, then the body. A chart in the body is described by the note to assistive technology.
export function Card({
  title,
  note,
  aside,
  children,
  ref
}: {
  title: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
  // A card that pauses its reads off screen observes itself.
  ref?: Ref<HTMLElement>;
}) {
  const titleId = useId();
  const noteId = useId();
  const heading = (
    <h3 className="rp-h3" id={titleId}>
      {title}
    </h3>
  );
  return (
    <section ref={ref} className="rp-card rp-titled" aria-labelledby={titleId}>
      {aside ? (
        <div className="rp-row">
          {heading}
          {aside}
        </div>
      ) : (
        heading
      )}
      {note && (
        <p className="rp-note" id={noteId}>
          {note}
        </p>
      )}
      <ChartDescription.Provider value={note ? noteId : undefined}>{children}</ChartDescription.Provider>
    </section>
  );
}
