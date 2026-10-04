import {createContext, use, useLayoutEffect, useRef} from 'react';
import {cx} from './cx';
import {SkeletonStatus, TableSkeleton, useWaitAttr} from './Feedback';

// What a page draws, top to bottom, for its Skeleton while its code or first reads load: its tab row, rows of M
// controls (or of a row's own `height`, such as a summary's), a line of text, a fact strip, cards (in a column; `columns` to a row, as a count or a grid template; or a
// CardView's grid), table rows under a header, and blocks such as an editor. Parts after the tab row are the tab
// panel's, at its narrower gap, as are all of a view's inside a tab panel (`panel`); cards with `gap: 'page'` are a
// page's own column. A route declares its own in the registry; a view inside a page passes its own.
export type PagePart =
  | {tabs: number}
  | {toolbar: number; height?: number}
  | {line: true}
  | {facts: number}
  | {cards: readonly number[]; columns?: number | string; grid?: true; gap?: 'page'}
  | {table: number}
  | {block: number};
export type PageShape = readonly PagePart[];

// The current route's shape, which the shell provides around the page.
export const PageShapeContext = createContext<PageShape>([{cards: [260, 260]}]);

// Control widths that vary along a row, so a toolbar does not read as a row of equal bars.
const controls = [128, 96, 112, 144, 88, 104];
const tableCols = [{minWidth: 240, isRowHeader: true}, {minWidth: 140}, {minWidth: 120}, {minWidth: 96}];

// A page's Skeleton in its own parts and gaps, so the page replaces it moving as little as possible. The page heading
// above it is the shell's own. One loading status for the whole page; the drawing is inert.
export function PageSkeleton({shape, panel}: {shape?: PageShape; panel?: boolean}) {
  const parts = shape ?? use(PageShapeContext);
  const wait = useWaitAttr();
  const hold = useHeldColumn();
  const tabs = parts.findIndex(part => 'tabs' in part);
  return (
    <div ref={hold} className={cx('rp-page-skeleton', panel && 'panel')} data-wait={wait}>
      <SkeletonStatus />
      {tabs < 0 ? (
        parts.map(drawPart)
      ) : (
        <>
          {parts.slice(0, tabs).map(drawPart)}
          <div className="rp-page-skeleton panel">{parts.slice(tabs).map(drawPart)}</div>
        </>
      )}
    </div>
  );
}
// WebKit lays out a size container (container-type) that has just been inserted before its contents, so the page that
// replaces the Skeleton is briefly shorter than the reader's scroll offset, and WebKit moves the reader to the top. The
// page's column keeps its height from before the swap through that first layout, and lets go two frames later. The
// height is read as layout reports it, never forced while React is changing the page.
function useHeldColumn() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const column = ref.current?.closest<HTMLElement>('.rp-content');
    if (!column) return;
    let height = 0;
    const watch = new ResizeObserver(([entry]) => {
      height = entry.borderBoxSize[0].blockSize;
    });
    watch.observe(column);
    return () => {
      watch.disconnect();
      if (!height) return;
      column.style.minHeight = `${height}px`;
      requestAnimationFrame(() => requestAnimationFrame(() => column.style.removeProperty('min-height')));
    };
  }, []);
  return ref;
}
function drawPart(part: PagePart, i: number) {
  return 'tabs' in part ? (
    <div key={i} className="rp-skeleton-controls" inert aria-hidden="true">
      <span className="rp-skeleton-text" style={{width: part.tabs * 80}} />
    </div>
  ) : 'toolbar' in part ? (
    <div key={i} className="rp-skeleton-controls" style={part.height ? {height: part.height} : undefined} inert aria-hidden="true">
      {Array.from({length: part.toolbar}, (_, n) => (
        <span key={n} className="rp-skeleton-text" style={{width: controls[n % 6]}} />
      ))}
    </div>
  ) : 'line' in part ? (
    <div key={i} className="rp-skeleton-row line" inert aria-hidden="true">
      <span className="rp-skeleton-text" />
    </div>
  ) : 'facts' in part ? (
    <div key={i} className="rp-strip rp-facts" style={{['--facts' as string]: part.facts}} inert aria-hidden="true">
      {Array.from({length: part.facts}, (_, n) => (
        <div key={n} className="rp-card">
          <span className="rp-tile-head">
            <span className="rp-skeleton-text" />
          </span>
          <span className="rp-tile-body">
            <span className="rp-big">
              <span className="rp-skeleton-text" />
            </span>
          </span>
        </div>
      ))}
    </div>
  ) : 'cards' in part ? (
    <div
      key={i}
      className={cx('rp-skeleton-cards', part.grid && 'grid', part.columns !== undefined && 'columns', part.gap)}
      style={
        part.columns === undefined
          ? undefined
          : {['--columns' as string]: typeof part.columns === 'number' ? `repeat(${part.columns}, minmax(0, 1fr))` : part.columns}
      }
      inert
      aria-hidden="true"
    >
      {part.cards.map((height, n) => (
        <div key={n} className="rp-card" style={{height}} />
      ))}
    </div>
  ) : 'table' in part ? (
    <div key={i} inert aria-hidden="true">
      <TableSkeleton cols={tableCols} rows={part.table} quiet />
    </div>
  ) : (
    <div key={i} className="rp-skeleton-body block" style={{height: part.block}} inert aria-hidden="true">
      <span className="rp-skeleton-text" />
    </div>
  );
}
