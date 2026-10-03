import {createContext, useContext, useId, type ReactNode, type Ref} from 'react';
import {ChartDescription} from './charts/description';
import {cx} from './cx';
import {HelpRow, type Help} from './ContextualHelp';
import {ActionHelp} from './Button';
import {ControlSizeContext, type ControlSize} from './controlSize';

// The card surface's class, for a react-aria element that has to be the card itself (a drop zone) and a form that is
// one. Extra classes lay out what the card holds.
export const cardClass = (...layout: Array<string | false | undefined>) => cx('rp-card', ...layout);

// False inside a preview whose frame already names it (a gallery item): its cards and widget sections keep their names
// for assistive technology but draw no title.
export const TitlesShown = createContext(true);

type Tint = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type TileHeader = {icon: ReactNode; tint: Tint; kind: 'metric' | 'control'; layout?: 'responsive'};

// A dashboard tile's caption: an icon in a role colour, the label, then any control the caption holds.
export function TileHead({icon, tint, kind, layout, label, children}: TileHeader & {label: string; children?: ReactNode}) {
  return (
    <span className={`${kind === 'metric' ? 'rp-tile-head' : 'rp-qlabel'} rp-tint-c${tint}`} data-layout={layout}>
      {icon}
      <span className={kind === 'metric' ? 'rp-tile-caption' : 'rp-truncate'}>{label}</span>
      {kind === 'metric' && children ? <span className="rp-tile-controls">{children}</span> : children}
    </span>
  );
}

// A card. A titled card is a section named by its heading: the title with an optional control beside it (a toggle, a
// link), an optional note on what the card is drawn from, then the body; a chart in the body is described by the note
// to assistive technology. With `tile` the title is a caption after an icon in a role colour, not a heading, and names
// nothing: a metric tile's small caption holds its own control (`aside`), and a control card's label sits beside or above
// its control, as its section lays out all its control cards (see packSection). An untitled card holds its own header,
// and takes `aria-label` when it needs a name.
// `titleVariant="caption"` keeps a titled region's name without adding a heading.
// A tile's caption needs its words, so a card with `tile` must have a `title`.
type CardHeader = {tile: TileHeader; title: string} | {tile?: undefined; title?: string};

export function Card({
  title,
  titleVariant = 'heading',
  level = 2,
  titleId,
  tile,
  note,
  help,
  aside,
  reason,
  id,
  className,
  isHighlighted,
  tabIndex,
  'aria-label': label,
  children,
  ref,
  size
}: CardHeader & {
  titleVariant?: 'heading' | 'caption';
  level?: 2 | 3;
  // A heading id other code relies on, such as a `?card=` scroll target.
  titleId?: string;
  note?: string;
  // What the title means, in a help popover beside it.
  help?: Help;
  aside?: ReactNode;
  // Why the card's disabled actions cannot run.
  reason?: string | null;
  id?: string;
  // Layout for what the card holds.
  className?: string;
  isHighlighted?: boolean;
  tabIndex?: number;
  'aria-label'?: string;
  children?: ReactNode;
  // A card that pauses its reads off screen observes itself.
  ref?: Ref<HTMLElement>;
  // L for a card in a row with a segmented control, such as the control cards, so the row's controls match it.
  size?: ControlSize;
}) {
  const ownTitleId = useId();
  const noteId = useId();
  const headingId = titleId ?? ownTitleId;
  const Heading = level === 2 ? 'h2' : 'h3';
  const Title = titleVariant === 'caption' ? 'span' : Heading;
  const shown = useContext(TitlesShown);
  const titled = title != null && !tile;
  const named = title != null && (shown || tile) && (
    <Title className={titleVariant === 'caption' ? 'rp-qlabel' : 'rp-h3'} id={headingId}>
      {title}
    </Title>
  );
  const heading = tile ? (
    <TileHead {...tile} label={title}>
      {tile.kind === 'metric' && aside}
    </TileHead>
  ) : named ? (
    <HelpRow help={help}>{named}</HelpRow>
  ) : (
    named
  );
  const card = (
    <section
      ref={ref}
      id={id}
      tabIndex={tabIndex}
      data-highlighted={isHighlighted || undefined}
      className={cardClass(
        titled && 'rp-titled',
        tile?.layout === 'responsive' && 'rp-tile-responsive',
        tile?.kind === 'control' && 'rp-control-card',
        className
      )}
      aria-labelledby={titled && shown && !label ? headingId : undefined}
      aria-label={label ?? (titled && !shown ? title : undefined)}
    >
      <ActionHelp reason={reason}>
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
      </ActionHelp>
    </section>
  );
  // A card's controls are M wherever the card sits, unless the card sets L.
  return <ControlSizeContext value={size ?? null}>{card}</ControlSizeContext>;
}
