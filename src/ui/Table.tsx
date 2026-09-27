import {useEffect, useMemo, useRef, useState, type ReactNode, type RefObject} from 'react';
import {cx} from './cx';
import {
  Table,
  ResizableTableContainer,
  ColumnResizer,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Virtualizer,
  TableLayout,
  Button as RButton,
  type Selection
} from 'react-aria-components';
import {useT} from '../i18n';
import ChevronDown from './icons/ChevronDown';
import {phoneQuery, useContentWidth, useMediaQuery} from './hooks';
import {TextTooltip, buttonClass} from './Button';
import {Empty, Loading} from './Feedback';

// Minima include padding; positive drop priorities yield in ascending order when columns cannot fit. A phone drops none:
// the table scrolls sideways instead (see DataTable).
type Col = {id: string; label: string; minWidth: number; grow?: number; isRowHeader?: boolean; align?: 'end'; drop?: number; sortable?: boolean};
export type TableSort = {column: string; direction: 'ascending' | 'descending'};
export type TableColumn<T> = Col & {render: (row: T) => ReactNode};
// A group row in tree mode: its label under the first column, its totals under the others, then its children.
export type TableGroup<T> = {id: string; group: string; label: string; totals: Record<string, ReactNode>; children: T[]};

export function TableColumns({cols, firstVisibleHeader}: {cols: Col[]; firstVisibleHeader?: boolean}) {
  const t = useT();
  return (
    <TableHeader>
      {cols.map((c, index) => (
        <Column
          key={c.id}
          id={c.id}
          isRowHeader={firstVisibleHeader ? index === 0 : c.isRowHeader}
          allowsSorting={c.sortable}
          className={c.align}
          defaultWidth={`${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr`}
          minWidth={c.minWidth}
        >
          {({sortDirection}) => (
            <>
              <span className="rp-th">
                {c.label}
                {sortDirection && <ChevronDown className={cx('rp-sort', sortDirection)} />}
              </span>
              <ColumnResizer className="rp-resizer" aria-label={t('ui.resizeColumn', {name: c.label})} />
            </>
          )}
        </Column>
      ))}
    </TableHeader>
  );
}

// Scrolls a selected row into view when the selection changes or the selected row first appears (a deep link
// before the rows load). A poll that only moves the row does not scroll: the person may have scrolled away.
export function useTableReveal(selected: string | null, at: number, ref: RefObject<HTMLElement | null>) {
  const index = useRef(at);
  useEffect(() => {
    index.current = at;
  });
  const present = at >= 0;
  useEffect(() => {
    const at = index.current;
    if (!selected || !present) return;
    const place = () => {
      const box = ref.current;
      if (!box) return;
      const top = tableLayout.headingHeight + at * tableLayout.rowHeight;
      const bottom = top + tableLayout.rowHeight;
      if (top < box.scrollTop + tableLayout.headingHeight) box.scrollTop = top - tableLayout.headingHeight;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    };
    const frame = requestAnimationFrame(place);
    // The table may still settle its height after the reveal (a tab bar, the detail panel); until the person
    // scrolls it themselves, a resize keeps the selected row in view.
    const box = ref.current;
    let held = true;
    const release = () => (held = false);
    const observer = new ResizeObserver(() => held && place());
    if (box) {
      observer.observe(box);
      for (const type of ['wheel', 'pointerdown', 'touchstart'] as const) box.addEventListener(type, release, {passive: true});
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (box) for (const type of ['wheel', 'pointerdown', 'touchstart'] as const) box.removeEventListener(type, release);
    };
  }, [selected, present, ref]);
}

export function selectedRow(keys: Selection): string | null {
  return keys === 'all' || !keys.size ? null : String([...keys][0]);
}

export function fitColumns<C extends {id: string; minWidth: number; drop?: number}>(cols: C[], width: number | null): C[] {
  if (width === null) return cols;
  const kept = new Set(cols.map(column => column.id));
  let total = cols.reduce((sum, column) => sum + column.minWidth, 0);
  for (const column of [...cols].filter(column => column.drop).sort((a, b) => a.drop! - b.drop!)) {
    if (total <= width) break;
    kept.delete(column.id);
    total -= column.minWidth;
  }
  return kept.size === cols.length ? cols : cols.filter(column => kept.has(column.id));
}

// Heights match tables-forms.css: a row is 40px; a heading is 8px padding twice, a 20px line and a 1px border.
export const tableLayout = {rowHeight: 40, headingHeight: 37};
// A table's height: its rows' height up to `height`, but a table that has shown its full height while loading keeps
// it, since growing from two rows to full height, or shrinking back when few rows arrive, moves everything below it.
// A short list (`fit`) holds two rows while loading instead and then fits what arrives.
export function useTableHeight(height: number, count: number, loading?: boolean, fit?: boolean) {
  const [reserved, setReserved] = useState(!fit && !!loading && !count);
  if (!fit && !reserved && loading && !count) setReserved(true);
  // Include the border-box frame to avoid a two-pixel scroll on short tables. Two rows hold the empty or loading message.
  const content = 2 + tableLayout.headingHeight + (count || 2) * tableLayout.rowHeight;
  return reserved ? height : Math.min(height, content);
}
// Rows built once per source object. A list re-read unchanged keeps its objects (replaceEqualDeep), so their rows keep
// their identity too, and the table re-renders only rows whose source changed. A new cache starts over.
export function cachedRows<T extends object, R>(cache: WeakMap<T, R>, items: T[], build: (item: T) => R): R[] {
  return items.map(item => {
    let row = cache.get(item);
    if (row === undefined) cache.set(item, (row = build(item)));
    return row;
  });
}
const virtualiseFrom = 40;
const isGroup = <T extends object>(row: T | TableGroup<T>): row is TableGroup<T> => 'children' in row;
// Plain text truncates with a tooltip.
const text = (cell: ReactNode) => (typeof cell === 'string' ? <TextTooltip>{cell}</TextTooltip> : cell);
// Once virtualised, keep the grid mounted to preserve focus, scroll and column widths.
export function DataTable<T extends {id: string}>({
  label,
  cols,
  rows,
  height = 442,
  selected: selectedProp,
  onSelect: onSelectProp,
  selectOnFocus,
  reveal,
  empty,
  loading,
  sort,
  onSort,
  getTextValue,
  stream,
  fit,
  tree,
  rowDetail,
  detail
}: {
  label: string;
  cols: TableColumn<T>[];
  rows: Array<T | TableGroup<T>>;
  height?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  // Arrow keys select as they move (a list with its detail beside it); otherwise Enter or Space selects.
  selectOnFocus?: boolean;
  // Fixed row heights allow revealing selected rows outside the DOM.
  reveal?: boolean;
  empty?: string;
  loading?: boolean;
  // Header clicks on sortable columns; the caller orders `rows`.
  sort?: TableSort | null;
  onSort?: (sort: TableSort) => void;
  getTextValue?: (row: T) => string;
  // Rows arrive continuously (logs, events, connections): virtualised from the start rather than on crossing a threshold.
  stream?: boolean;
  // A list that is often short (sources, data files, the DNS cache, events): no full-height placeholder while it loads.
  fit?: boolean;
  // Tree mode (connections): `rows` may hold groups, which cannot be selected and fold as `collapsed` says; the chevron
  // or ArrowLeft/ArrowRight on a group row calls `onToggle`. The first visible column heads each row and, once
  // `grouped`, holds the tree. Home and End move between rows, never within one.
  tree?: {grouped: boolean; collapsed: (group: string) => boolean; onToggle: (group: string) => void};
  // A row press opens a detail that shows every column's value in full, so a tap on cut text there opens the detail
  // rather than a tip (TextTooltip).
  rowDetail?: boolean;
  // A row press discloses `detail(row)` under the table, the place for text the columns cut or drop; Enter or Space on
  // the focused row does the same, and a second press closes it. `selected` and `onSelect` may still drive the row.
  detail?: (row: T) => ReactNode;
}) {
  const t = useT();
  // A detail without an owner keeps its open row here.
  const [own, setOwn] = useState<string | null>(null);
  const owned = !!detail && onSelectProp === undefined;
  const selected = owned ? own : selectedProp;
  const onSelect = owned ? setOwn : onSelectProp;
  // One set per selected key, so the table neither recomputes its selection nor re-renders every row.
  const keys: Selection = useMemo(() => (selected ? new Set([selected]) : new Set()), [selected]);
  const [ref, containerWidth] = useContentWidth<HTMLElement>();
  // A tree fits its columns to the grid, which scrolls it, so its width excludes the scrollbar gutter.
  const [treeGridRef, gridWidth] = useContentWidth<HTMLElement>();
  const width = tree ? gridWidth : containerWidth;
  // Fitting a phone's width would leave one or two columns and put the rest of each row out of reach, so there every
  // column keeps its minimum and the table scrolls sideways; wider screens drop columns rather than scroll.
  const phone = useMediaQuery(phoneQuery);
  const shown = useMemo(() => fitColumns(cols, phone ? null : width), [cols, phone, width]);
  // Groups count as rows for the height, the virtual row count and the reveal offset; a folded group's children do not.
  const flat = useMemo(
    () => (tree ? rows.flatMap(row => (isGroup(row) ? (tree.collapsed(row.group) ? [row] : [row, ...row.children]) : [row])) : rows),
    [rows, tree]
  );
  const groups = useMemo(() => (tree ? rows.filter(isGroup) : []), [rows, tree]);
  const groupKeys = useMemo(() => (tree ? groups.map(row => row.id) : undefined), [groups, tree]);
  const expandedKeys = useMemo(() => (tree ? groups.filter(row => !tree.collapsed(row.group)).map(row => row.id) : undefined), [groups, tree]);
  const fitted = useTableHeight(height, flat.length, loading, fit);
  const [virtual, setVirtual] = useState(stream || flat.length >= virtualiseFrom);
  if (!virtual && flat.length >= virtualiseFrom) setVirtual(true);
  const at = reveal && selected ? flat.findIndex(r => r.id === selected) : -1;
  // A virtualised grid scrolls itself, a native table its container; the virtual height lands a frame later.
  const grid = useRef<HTMLElement>(null);
  useTableReveal(reveal ? (selected ?? null) : null, at, virtual ? grid : ref);
  // Tree cells wrap their content so it truncates inside the flex cell.
  const content = (cell: ReactNode) => (tree ? <span className="cell">{text(cell)}</span> : text(cell));
  const renderRow = (row: T) => {
    return (
      <Row key={row.id} id={row.id} textValue={getTextValue?.(row)}>
        {shown.map(column => (
          <Cell key={column.id} className={column.align}>
            {content(column.render(row))}
          </Cell>
        ))}
      </Row>
    );
  };
  const renderGroup = (row: TableGroup<T>) => (
    <Row key={row.id} id={row.id} textValue={row.label}>
      {shown.map((column, index) => (
        <Cell key={column.id} className={column.align}>
          {index === 0 && (
            <RButton slot="chevron" className={cx(buttonClass({quiet: true, icon: true, small: true}), 'rp-expand')}>
              <ChevronDown />
            </RButton>
          )}
          <span className="cell">{index === 0 ? <strong>{row.label}</strong> : text(row.totals[column.id])}</span>
        </Cell>
      ))}
      {row.children.map(renderRow)}
    </Row>
  );
  const table = (
    <Table
      // A native table overflows its container, which scrolls it. A virtualised grid scrolls itself and lays its columns
      // out wider than itself; a minimum width would make the container scroll it instead, vertical scrollbar and all.
      // A tree measures the grid, so a minimum width would also feed back into that measure.
      style={tree || virtual ? undefined : {minWidth: shown.reduce((sum, column) => sum + column.minWidth, 0)}}
      ref={element => {
        grid.current = element;
        if (tree) treeGridRef.current = element;
      }}
      aria-label={label}
      aria-rowcount={virtual ? flat.length + 1 : undefined}
      expandedKeys={expandedKeys}
      onExpandedChange={keys => {
        if (tree) for (const row of groups) if (keys.has(row.id) === tree.collapsed(row.group)) tree.onToggle(row.group);
      }}
      disabledKeys={groupKeys}
      // Group rows take focus, so the arrow keys can fold them, but never the selection.
      disabledBehavior="selection"
      treeColumn={tree?.grouped ? shown[0]?.id : undefined}
      selectionMode={onSelect ? 'single' : 'none'}
      selectionBehavior={selectOnFocus ? 'replace' : 'toggle'}
      selectedKeys={keys}
      // The selection is never emptied from inside: focusing a group row asks to replace it with nothing, which leaves
      // the selected connection and its detail as they were. A disclosed detail closes on a second press.
      onSelectionChange={keys => {
        const id = selectedRow(keys);
        if (id !== null || detail) onSelect?.(id);
      }}
      disallowEmptySelection={!!onSelect && !detail}
      sortDescriptor={sort ? {column: sort.column, direction: sort.direction} : undefined}
      onSortChange={descriptor => onSort && descriptor.direction && onSort({column: String(descriptor.column), direction: descriptor.direction})}
    >
      <TableColumns cols={shown} firstVisibleHeader={!!tree} />
      <TableBody<T | TableGroup<T>>
        items={rows}
        dependencies={[shown, getTextValue]}
        renderEmptyState={() => (
          <div className="rp-table-empty" style={{width: width ?? '100%'}}>
            {loading ? <Loading /> : <Empty>{empty ?? t('ui.empty')}</Empty>}
          </div>
        )}
      >
        {row => (tree && isGroup(row) ? renderGroup(row) : renderRow(row as T))}
      </TableBody>
    </Table>
  );
  const container = (
    <ResizableTableContainer
      ref={element => {
        ref.current = element;
      }}
      className="rp-table"
      data-row-detail={rowDetail || detail ? '' : undefined}
      style={{height: fitted}}
      // RAC scopes Home/End to cells unless the row itself has focus. The container passes no key handlers, so a
      // tree renders its own div to catch the key first.
      render={
        tree
          ? props => (
              <div
                {...props}
                onKeyDownCapture={event => {
                  if (event.key === 'Home' || event.key === 'End')
                    (event.target as HTMLElement).closest<HTMLElement>('[role="row"][data-key]')?.focus({preventScroll: true});
                }}
              />
            )
          : undefined
      }
    >
      {virtual ? (
        <Virtualizer layout={TableLayout} layoutOptions={tableLayout}>
          {table}
        </Virtualizer>
      ) : (
        table
      )}
    </ResizableTableContainer>
  );
  if (!detail) return container;
  const open = selected ? flat.find(row => row.id === selected && !isGroup(row)) : undefined;
  return (
    <>
      {container}
      {/* Always mounted, so the text it takes is announced; empty, it takes no room. */}
      <div className="rp-table-detail" aria-live="polite">
        {open && detail(open as T)}
      </div>
    </>
  );
}
