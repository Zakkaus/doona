import {useId, type ReactNode, type Ref} from 'react';
import {ChartDescription} from './charts/description';
import {cx} from './cx';

// The card surface's class, for a react-aria element that has to be the card itself (a drop zone) and a form that is
// one. Extra classes lay out what the card holds.
export const cardClass = (...layout: Array<string | false | undefined>) => cx('rp-card', ...layout);

type Tint = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type TileHeader = {icon: ReactNode; tint: Tint; kind: 'metric' | 'control'};

// A dashboard tile's caption: an icon in a role colour, the label, then any control the caption holds.
export function TileHead({icon, tint, kind, label, children}: TileHeader & {label: string; children?: ReactNode}) {
  return (
    <span className={`${kind === 'metric' ? 'rp-tile-head' : 'rp-qlabel'} rp-tint-c${tint}`}>
      {icon}
      {label}
      {children}
    </span>
  );
}

// A card. A titled card is a section named by its heading: the title with an optional control beside it (a toggle, a
// link), an optional note on what the card is drawn from, then the body; a chart in the body is described by the note
// to assistive technology. With `tile` the title is a caption after an icon in a role colour, not a heading, and names
// nothing: a metric tile's small caption holds its own control (`aside`), and a control card's label sits beside its
// control. An untitled card holds its own header, and takes `aria-label` when it needs a name.
// A tile's caption needs its words, so a card with `tile` must have a `title`.
type CardHeader = {tile: TileHeader; title: string} | {tile?: undefined; title?: string};

export function Card({
  title,
  level = 3,
  titleId,
  tile,
  note,
  aside,
  id,
  className,
  tabIndex,
  'aria-label': label,
  children,
  ref
}: CardHeader & {
  level?: 2 | 3;
  // A heading id other code relies on, such as a `?card=` scroll target.
  titleId?: string;
  note?: string;
  aside?: ReactNode;
  id?: string;
  // Layout for what the card holds.
  className?: string;
  tabIndex?: number;
  'aria-label'?: string;
  children?: ReactNode;
  // A card that pauses its reads off screen observes itself.
  ref?: Ref<HTMLElement>;
}) {
  const ownTitleId = useId();
  const noteId = useId();
  const headingId = titleId ?? ownTitleId;
  const Heading = level === 2 ? 'h2' : 'h3';
  const titled = title != null && !tile;
  const heading = tile ? (
    <TileHead {...tile} label={title}>
      {tile.kind === 'metric' && aside}
    </TileHead>
  ) : (
    title != null && (
      <Heading className="rp-h3" id={headingId}>
        {title}
      </Heading>
    )
  );
  return (
    <section
      ref={ref}
      id={id}
      tabIndex={tabIndex}
      className={cardClass(titled && 'rp-titled', className)}
      aria-labelledby={titled ? headingId : undefined}
      aria-label={label}
    >
      {aside && tile?.kind !== 'metric' ? (
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
