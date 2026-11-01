import {createContext, Suspense, use, useLayoutEffect, useRef, type ComponentType} from 'react';
import {useT, type Key} from '../i18n';
import {cx} from './cx';
import {useWaitAttr} from './Empty';
import {sized, SkeletonCard, SkeletonStatus, TableSkeleton} from './Skeleton';
// The sections' grids, which the startup Skeleton lays its dashboard cards out in as the dashboard does.
import './styles/dashboard.css';

// What a page draws, top to bottom, for its Skeleton while its code or first reads load: its tab row, with the tabs'
// own labels; rows of M controls (or of a row's own `height`, such as a summary's), as many as the row has controls and
// `end` of them at the end of the row; a `summary`, the status, its facts (the first with its help button's height) and a
// badge in the row's own wrapping, with the page's actions beside them; a line of text, a fact strip (a `lead` name first, `caption` under its first
// value), cards (in a column; `columns` to a row, as a count or a grid template; the page's own grid `class`; or a CardView's grid), a framed table
// of rows under its header, blocks such as an editor, dashboard `sections` of cards in their cells, a page's `draw`ing of its own (the dashboard's saved cards), and a `column` of parts at the panel's gap, for a group the page lays out apart from the rest. Parts after the tab row are the tab panel's, at its narrower
// gap, as are all of a view's inside a tab panel (`panel`); cards with `gap: 'page'` are a page's own column. A part
// whose height follows the data (`typical`; a table, a block, or the cards of a group named by index) draws a typical
// one, held to its place and width but not its height. A route declares its own in the registry; a view inside a page passes its own.
export type PagePart =
  | {tabs: readonly Key[]}
  | {toolbar: number; height?: number | readonly [number, number]; end?: number}
  | {summary: {state: number; facts: readonly number[]; badge: number; actions: readonly number[]}}
  | {line: 'body' | 'caption'}
  | {facts: number; lead?: true; caption?: true}
  | {
      cards: ReadonlyArray<number | readonly [number, number]>;
      columns?: number | string;
      class?: string;
      grid?: true;
      gap?: 'page';
      typical?: true | readonly number[];
    }
  | {sections: ReadonlyArray<SkeletonSection>}
  | {table: number}
  | {block: number}
  | {draw: ComponentType}
  | {column: readonly PagePart[]};
// A dashboard section: its profile names the grid the dashboard's CSS lays its cards out in (dashboard.css). A card is
// named for its module, which dashboard.css gives the height the loaded card takes at each width, and the attributes
// its cell carries for that grid: its footprint and size, and `typical` when its height follows its data.
export type SkeletonSection = {
  profile: string;
  cards: ReadonlyArray<readonly [card: string, cell?: {foot?: string; size?: string; typical?: true}]>;
};
export type PageShape = readonly PagePart[];

// The current route's shape, which the shell provides around the page.
export const PageShapeContext = createContext<PageShape>([{cards: [260, 260], typical: true}]);

// Control widths that vary along a row, so a toolbar does not read as a row of equal bars.
const controls = [128, 96, 112, 144, 88, 104];
// A table's frame, its header band and its rows, as the table the page draws takes them.
const TABLE_HEAD = 40;
const TABLE_ROW = 40;
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
        drawn(parts)
      ) : (
        <>
          {parts.slice(0, tabs).map((part, i) => (
            <DrawPart key={i} part={part} />
          ))}
          <div className="rp-page-skeleton panel">
            {parts.slice(tabs).map((part, i) => (
              <DrawPart key={i} part={part} />
            ))}
          </div>
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
      if (height) holdColumn(column, height);
    };
  }, []);
  return ref;
}
// The latest hold on each column. Swaps a frame apart overlap, and only the latest hold lets go, so an earlier
// Skeleton's release does not drop the height a later one is holding.
const holders = new WeakMap<HTMLElement, object>();
export function holdColumn(column: HTMLElement, height: number) {
  const hold = {};
  holders.set(column, hold);
  column.style.minHeight = `${height}px`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (holders.get(column) !== hold) return;
      holders.delete(column);
      column.style.removeProperty('min-height');
    })
  );
}
const drawn = (parts: readonly PagePart[]) => parts.map((part, i) => <DrawPart key={i} part={part} />);
function DrawPart({part}: {part: PagePart}) {
  const t = useT();
  return 'tabs' in part ? (
    <div className="rp-tabbar" data-page-tabrow inert aria-hidden="true">
      <div className="rp-tablist">
        {part.tabs.map(key => (
          <span key={key} className="rp-tab">
            {t(key)}
          </span>
        ))}
      </div>
    </div>
  ) : 'toolbar' in part ? (
    <div className="rp-skeleton-controls" style={part.height ? sized(part.height) : undefined} inert aria-hidden="true">
      {Array.from({length: part.toolbar}, (_, n) => (
        <span key={n} className={cx('rp-skeleton-text', n === part.toolbar - (part.end ?? 0) && 'end')} style={{width: controls[n % 6]}} />
      ))}
    </div>
  ) : 'summary' in part ? (
    <div className="rp-between rp-skeleton-summary" inert aria-hidden="true">
      <div className="rp-cluster">
        <span className="rp-skeleton-text" style={{width: part.summary.state, height: 20}} />
        <div className="rp-kv inline row">
          {part.summary.facts.map((width, n) => (
            <div key={n}>
              <span className="rp-skeleton-text" style={{width, height: n ? 20 : 24}} />
            </div>
          ))}
        </div>
        <span className="rp-skeleton-text" style={{width: part.summary.badge, height: 20}} />
      </div>
      <div className="rp-cluster">
        {part.summary.actions.map((width, n) => (
          <span key={n} className="rp-skeleton-text" style={{width}} />
        ))}
      </div>
    </div>
  ) : 'line' in part ? (
    <div className="rp-skeleton-row line" style={{height: `var(--rp-line-${part.line})`}} inert aria-hidden="true">
      <span className="rp-skeleton-text" />
    </div>
  ) : 'facts' in part ? (
    <div
      className={cx('rp-strip rp-facts', part.lead && 'rp-facts-lead')}
      style={{['--facts' as string]: part.facts, ['--facts-rest' as string]: part.facts - 1}}
      inert
      aria-hidden="true"
    >
      {Array.from({length: part.facts}, (_, n) => (
        <div key={n} className="rp-card">
          <span className="rp-tile-head">
            <span className="rp-skeleton-text" />
          </span>
          <span className="rp-tile-body">
            <span className="rp-big">
              <span className="rp-skeleton-text" />
            </span>
            {part.caption && !n && (
              <span className="rp-fact-caption">
                <span className="rp-skeleton-text" />
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  ) : 'cards' in part ? (
    <div
      className={cx('rp-skeleton-cards', part.class, part.grid && 'grid', part.columns !== undefined && 'columns', part.gap)}
      style={
        part.columns === undefined
          ? undefined
          : {['--columns' as string]: typeof part.columns === 'number' ? `repeat(${part.columns}, minmax(0, 1fr))` : part.columns}
      }
      inert
      aria-hidden="true"
    >
      {part.cards.map((height, n) => (
        <div key={n} className="rp-card" style={sized(height)} data-typical={part.typical === true || part.typical?.includes(n) || undefined} />
      ))}
    </div>
  ) : 'sections' in part ? (
    <div className="rp-dashboard">
      {part.sections.map(({profile, cards}) => (
        <div key={profile} className="rp-dash-section" data-profile={profile}>
          {cards.map(([card, cell], n) => (
            <div key={n} className="rp-dashboard-cell" data-foot={cell?.foot} data-size={cell?.size}>
              <SkeletonCard card={card} typical={cell?.typical} />
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : 'table' in part ? (
    <div className="rp-table" style={{height: TABLE_HEAD + part.table * TABLE_ROW}} data-typical inert aria-hidden="true">
      <div className="rp-table-skeleton-head" />
      <TableSkeleton cols={tableCols} rows={part.table} quiet />
    </div>
  ) : 'block' in part ? (
    <div className="rp-skeleton-body block" style={{height: part.block}} data-typical inert aria-hidden="true">
      <span className="rp-skeleton-text" />
    </div>
  ) : 'draw' in part ? (
    <Suspense>
      <part.draw />
    </Suspense>
  ) : (
    <div className="rp-page-skeleton panel">{drawn(part.column)}</div>
  );
}
