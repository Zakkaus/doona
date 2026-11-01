import type {ReactNode} from 'react';
import {VisuallyHidden} from 'react-aria';
import {useT} from '../i18n';
import {columns as listColumns, cx} from './cx';
import {useWaitAttr} from './Empty';

// The loading rule (CONTRIBUTING, Loading states): a first load whose content shape is known draws S2's Skeleton in
// that shape and box, so nothing moves when the content replaces it; ProgressCircle (Loading) is for waits whose shape
// is unknown or tiny. Every skeleton holds its box at once, shows after 150ms like Loading, reads one visually hidden
// loading status, and keeps its drawing inert and hidden from assistive technology.
// Bar widths that vary from row to row, so rows do not read as a grid of equal bars.
const longBars = [72, 88, 64, 80, 58, 84];
const shortBars = [56, 44, 64, 50, 60, 40];
export function SkeletonStatus({label}: {label?: string}) {
  const t = useT();
  return <VisuallyHidden role="status">{label ?? t('ui.loading')}</VisuallyHidden>;
}

// S2's Skeleton for a card body of facts while its data arrives: the facts' grid with each label and value drawn as a
// shimmering block in its place, then what the body holds below them (a caption line, a body line, or a height in
// pixels such as a table's), so the card keeps its height when the values replace it. `helped` lists the facts whose
// label carries a help button, whose line takes the button's height, and `metered` those with a meter's track under
// their value. A `typical` height below follows the data.
export function Skeleton({
  facts,
  helped,
  metered,
  below,
  typical
}: {
  facts: number;
  helped?: number[];
  metered?: number[];
  below?: 'caption' | 'body' | number;
  typical?: boolean;
}) {
  const wait = useWaitAttr();
  return (
    <div className="rp-skeleton" data-wait={wait} data-typical={typical}>
      <SkeletonStatus />
      <div className="rp-kv" inert aria-hidden="true">
        {Array.from({length: facts}, (_, i) => (
          <div key={i} className={cx(metered?.includes(i) && 'rp-kv-meter')}>
            <span className={cx('k', helped?.includes(i) && 'helped')}>
              <span className="rp-skeleton-text" />
            </span>
            <span className="v">
              <span className="rp-skeleton-text" />
            </span>
            {metered?.includes(i) && <span className="track" />}
          </div>
        ))}
      </div>
      {below !== undefined && (
        <div
          className={cx('rp-skeleton-below', typeof below === 'number' && 'block')}
          style={{height: typeof below === 'number' ? below : `var(--rp-line-${below})`}}
          inert
          aria-hidden="true"
        >
          <span className="rp-skeleton-text" />
        </div>
      )}
    </div>
  );
}

// The Skeleton for a body of a known kind, drawn in the loaded body's own parts so it takes the same box: `block`, one
// block filling its box (a chart, an editor), as inside a ChartWait, or `height` pixels tall; `rows`, list rows at the
// control height; `bars`, ranking bars in the Bar's own label line and track, laid out as a wide card's list with
// `columns`; `fields`, labelled fields in the field grid; `cards`, card surfaces `height` pixels tall, in a column or,
// with `grid`, in a CardView's grid. `label` replaces the status text.
type SkeletonShape = 'block' | 'rows' | 'bars' | 'fields' | 'cards';
export function SkeletonBody({
  shape,
  count = 3,
  height,
  grid,
  columns,
  typical,
  label
}: {
  shape: SkeletonShape;
  count?: number;
  height?: number;
  grid?: boolean;
  columns?: boolean;
  // The body's height follows the data, so `height` is a typical one.
  typical?: boolean;
  label?: string;
}) {
  const wait = useWaitAttr();
  const n = shape === 'block' ? 1 : count;
  if (shape === 'cards')
    return (
      <div className={cx('rp-skeleton-cards', grid && 'grid')} data-wait={wait} data-typical={typical}>
        <SkeletonStatus label={label} />
        {Array.from({length: n}, (_, i) => (
          <div key={i} className="rp-card" style={{height}} inert aria-hidden="true" />
        ))}
      </div>
    );
  const line = (i: number, bars = longBars) => <span className="rp-skeleton-text" style={{width: `${bars[i % 6]}%`}} />;
  return (
    <div
      className={cx('rp-skeleton-body', shape, shape === 'bars' && 'rp-list', columns && 'rp-columns')}
      style={columns ? listColumns(n) : height ? {height} : undefined}
      data-wait={wait}
      data-typical={typical}
    >
      <SkeletonStatus label={label} />
      {Array.from({length: n}, (_, i) =>
        shape === 'block' ? (
          <span key={i} className="rp-skeleton-text" inert aria-hidden="true" />
        ) : shape === 'bars' ? (
          <div key={i} className="rp-bar" inert aria-hidden="true">
            <div className="top">
              <span className="l">{line(i)}</span>
              <span className="v">{line(i, shortBars)}</span>
            </div>
            <div className="track" />
          </div>
        ) : shape === 'fields' ? (
          <div key={i} className="rp-skeleton-field" inert aria-hidden="true">
            {line(i, shortBars)}
            <span className="rp-skeleton-text" />
          </div>
        ) : (
          <div key={i} className="rp-skeleton-row" inert aria-hidden="true">
            {line(i)}
          </div>
        )
      )}
    </div>
  );
}
// One Skeleton bar for a part a feature lays out beside its real labels: a control at the control height, a line of
// body or caption text, or a block `height` pixels tall such as a small chart, or its height wide and then on a phone
// for a note that takes more lines there. Inert and hidden from assistive technology; a SkeletonGroup round it reads the status.
export function SkeletonBar({line, width, height}: {line?: 'body' | 'caption'; width?: number | string; height?: number | readonly [number, number]}) {
  return (
    <span
      className={cx('rp-skeleton-text', 'rp-skeleton-bar', line ?? 'control')}
      style={{width, ...(height === undefined ? undefined : sized(height))}}
      inert
      aria-hidden="true"
    />
  );
}
// A Skeleton block over its positioned parent's whole box, for a hold that lays out the loaded view hidden underneath
// so the block takes its exact size. It shows after the same 150ms; it reads no status, which a table or group beside
// it already reads for the same load.
export function SkeletonCover() {
  const wait = useWaitAttr();
  return <span className="rp-skeleton-text rp-skeleton-cover" data-wait={wait} inert aria-hidden="true" />;
}
// A height, or its height wide and then on a phone, where the content takes more lines (see cards-dashboard.css).
export const sized = (height: number | readonly [number, number]) =>
  typeof height === 'number' ? {height} : {['--wide' as string]: `${height[0]}px`, ['--narrow' as string]: `${height[1]}px`};
// One card's surface with its Skeleton block, for a grid that places cards itself, such as the dashboard's; inside a
// PageSkeleton, which reads the status. It is `height` pixels tall, or a dashboard module's `card`, whose height the
// dashboard's CSS tells at the card's width (see dashboard.css). A `typical` height follows the card's data.
export function SkeletonCard({height, card, typical}: {height?: number | readonly [number, number]; card?: string; typical?: boolean}) {
  return (
    <div className="rp-skeleton-cards" inert aria-hidden="true">
      <div className="rp-card" style={height === undefined ? undefined : sized(height)} data-card={card} data-typical={typical || undefined} />
    </div>
  );
}
// Labelled parts drawn with SkeletonBars, in place in their container's own layout: one loading status for them all,
// shown after the same 150ms. `quiet`: another Skeleton of the same read holds the status.
export function SkeletonGroup({label, quiet, children}: {label?: string; quiet?: boolean; children: ReactNode}) {
  const wait = useWaitAttr();
  return (
    <div className="rp-skeleton-group" data-wait={wait}>
      {!quiet && <SkeletonStatus label={label} />}
      {children}
    </div>
  );
}

// The Skeleton for a table's first load: placeholder rows at the real row height under the real header, one bar per
// cell in the columns' own proportions. The columns carry no kind, so their shape stands in for it: a row header, a
// wrapping column or a wide one holds text and takes a long bar, a narrow one (a time, a number, a state) a short bar,
// and an actions column none.
type SkeletonColumn = {minWidth: number; grow?: number; isRowHeader?: boolean; actions?: boolean; text?: 'wrap'};
// `quiet`: inside a page's Skeleton, which holds the status and the delay.
export function TableSkeleton({cols, rows, quiet}: {cols: SkeletonColumn[]; rows: number; quiet?: boolean}) {
  const wait = useWaitAttr(!quiet);
  const template = cols.map(c => `minmax(${c.minWidth}px, ${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr)`).join(' ');
  return (
    <div className="rp-table-skeleton" data-wait={quiet ? undefined : wait} data-typical>
      {!quiet && <SkeletonStatus />}
      <div style={{gridTemplateColumns: template}} inert aria-hidden="true">
        {Array.from({length: rows}, (_, row) =>
          cols.map((c, col) => {
            const bars = c.isRowHeader || c.text === 'wrap' || c.minWidth >= 200 ? longBars : shortBars;
            return (
              <span key={`${row}-${col}`}>{!c.actions && <span className="rp-skeleton-text" style={{width: `${bars[(row * 5 + col * 3) % 6]}%`}} />}</span>
            );
          })
        )}
      </div>
    </div>
  );
}
