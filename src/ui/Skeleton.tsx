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
// label carries a help button, whose line takes the button's height.
export function Skeleton({facts, helped, below}: {facts: number; helped?: number[]; below?: 'caption' | 'body' | number}) {
  const wait = useWaitAttr();
  return (
    <div className="rp-skeleton" data-wait={wait}>
      <SkeletonStatus />
      <div className="rp-kv" inert aria-hidden="true">
        {Array.from({length: facts}, (_, i) => (
          <div key={i}>
            <span className={cx('k', helped?.includes(i) && 'helped')}>
              <span className="rp-skeleton-text" />
            </span>
            <span className="v">
              <span className="rp-skeleton-text" />
            </span>
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
export type SkeletonShape = 'block' | 'rows' | 'bars' | 'fields' | 'cards';
export function SkeletonBody({
  shape,
  count = 3,
  height,
  grid,
  columns,
  label
}: {
  shape: SkeletonShape;
  count?: number;
  height?: number;
  grid?: boolean;
  columns?: boolean;
  label?: string;
}) {
  const wait = useWaitAttr();
  const n = shape === 'block' ? 1 : count;
  if (shape === 'cards')
    return (
      <div className={cx('rp-skeleton-cards', grid && 'grid')} data-wait={wait}>
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
// body or caption text, or a block `height` pixels tall such as a small chart. Inert and hidden from assistive technology; a SkeletonGroup round it reads the status.
export function SkeletonBar({line, width, height}: {line?: 'body' | 'caption'; width?: number | string; height?: number}) {
  return <span className={cx('rp-skeleton-text', 'rp-skeleton-bar', line ?? 'control')} style={{width, height}} inert aria-hidden="true" />;
}
// A Skeleton block over its positioned parent's whole box, for a hold that lays out the loaded view hidden underneath
// so the block takes its exact size. It shows after the same 150ms; it reads no status, which a table or group beside
// it already reads for the same load.
export function SkeletonCover() {
  return <span className="rp-skeleton-text rp-skeleton-cover" data-wait={useWaitAttr()} inert aria-hidden="true" />;
}
// One card's surface `height` pixels tall with its Skeleton block, for a grid that places cards itself, such as the
// dashboard's; inside a SkeletonGroup, which reads the status.
export function SkeletonCard({height}: {height: number}) {
  return (
    <div className="rp-skeleton-cards" inert aria-hidden="true">
      <div className="rp-card" style={{height}} />
    </div>
  );
}
// Labelled parts drawn with SkeletonBars, in place in their container's own layout: one loading status for them all,
// shown after the same 150ms.
export function SkeletonGroup({label, children}: {label?: string; children: ReactNode}) {
  return (
    <div className="rp-skeleton-group" data-wait={useWaitAttr()}>
      <SkeletonStatus label={label} />
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
  const wait = useWaitAttr();
  const template = cols.map(c => `minmax(${c.minWidth}px, ${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr)`).join(' ');
  return (
    <div className="rp-table-skeleton" data-wait={quiet ? undefined : wait}>
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
