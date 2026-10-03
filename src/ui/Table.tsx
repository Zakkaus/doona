import {createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject} from 'react';
import {cx} from './cx';
import {VisuallyHidden} from 'react-aria';
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
  type Selection,
  type TableBodyProps
} from 'react-aria-components';
import {useT} from '../i18n';
import ChevronDown from './icons/ChevronDown';
import {phoneQuery, useContentWidth, useMediaQuery} from './hooks';
import {TextTooltip} from './Tooltip';
import {buttonClass} from './Button';
import {Empty, Loading} from './Feedback';
import {revealFlowRow, useTableFlow} from './tableFlow';
import {fitColumns, selectedRow, tableLayout, useTableHeight, useTableReveal} from './tableHooks';

// Minima include padding; positive drop priorities yield in ascending order when columns cannot fit. A phone drops none:
// complete text fits the viewport and secondary columns scroll sideways (see DataTable).
type Col = {
  id: string;
  label: string;
  minWidth: number;
  grow?: number;
  isRowHeader?: boolean;
  drop?: number;
  sortable?: boolean;
  hideLabel?: boolean;
  actions?: boolean;
  text?: 'wrap';
};
export type TableSort = {column: string; direction: 'ascending' | 'descending'};
export type TableColumn<T> = Col & {render: (row: T) => ReactNode};
// A group row in tree mode: its label spans columns before the totals, then its children.
export type TableGroup<T> = {id: string; group: string; label: string; totals: Record<string, ReactNode>; children: T[]};

// `resizable`: false leaves the resizers out. In a grid with no rows React Aria (1.21) keeps Tab on the first column's
// resizer, so a table without rows has none.
export function TableColumns({cols, firstVisibleHeader, resizable = true}: {cols: Col[]; firstVisibleHeader?: boolean; resizable?: boolean}) {
  const t = useT();
  return (
    <TableHeader>
      {cols.map((c, index) => (
        <Column
          key={c.id}
          id={c.id}
          isRowHeader={firstVisibleHeader ? index === 0 : c.isRowHeader}
          allowsSorting={c.sortable}
          defaultWidth={`${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr`}
          minWidth={c.minWidth}
        >
          {({sortDirection}) => (
            <>
              <span className="rp-th">
                {c.hideLabel ? <VisuallyHidden>{c.label}</VisuallyHidden> : c.label}
                {sortDirection && <ChevronDown className={cx('rp-sort', sortDirection)} />}
              </span>
              {resizable && <ColumnResizer className="rp-resizer" aria-label={t('ui.resizeColumn', {name: c.label})} />}
            </>
          )}
        </Column>
      ))}
    </TableHeader>
  );
}

// A menu or dialog opened from a control in a row gives focus back to that control when it closes, but RAC (1.21) then
// moves it on to the cell's first control, or to the row. Focus that comes back from an overlay to the same row goes
// to the control it left from; a press in the table first means the person chose where focus goes.
const overlays = '[role="dialog"], [role="alertdialog"], [role="menu"]';
function useOpenerFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    let opener: HTMLElement | null = null;
    const leave = (event: FocusEvent) => {
      const to = event.relatedTarget as Element | null;
      opener = to && !table.contains(to) && to.closest(overlays) ? (event.target as HTMLElement) : null;
    };
    const enter = (event: FocusEvent) => {
      const back = opener;
      opener = null;
      const from = event.relatedTarget as Node | null;
      const target = event.target as HTMLElement;
      if (!back?.isConnected || target === back || (from && table.contains(from))) return;
      if (back.closest('[role="row"]') === target.closest('[role="row"]')) back.focus({preventScroll: true});
    };
    const press = () => {
      opener = null;
    };
    table.addEventListener('focusout', leave);
    table.addEventListener('focusin', enter);
    table.addEventListener('pointerdown', press, true);
    return () => {
      table.removeEventListener('focusout', leave);
      table.removeEventListener('focusin', enter);
      table.removeEventListener('pointerdown', press, true);
    };
  }, [ref]);
}
const virtualiseFrom = 40;
// The body takes its rows from context, so new rows re-render the collection but not the table around it. React Aria
// renders the visible rows again for every new collection; a re-rendered table would render them once more before it.
// Marked pure, so importing the UI module from the startup chunk does not pull the table code into it.
const RowsContext = /* @__PURE__ */ createContext<readonly object[]>([]);
const noGroups: never[] = [];
function TableRows<T extends object>(props: Omit<TableBodyProps<T>, 'items'>) {
  return <TableBody<T> {...props} items={useContext(RowsContext) as T[]} />;
}
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
  highlighted,
  empty,
  loading,
  sort,
  onSort,
  getTextValue,
  stream,
  fit,
  flow,
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
  // Reveals the selected row, using the layout for virtual rows outside the DOM.
  reveal?: boolean;
  // The row a link landed on, marked for a moment (see useLandingHighlight).
  highlighted?: string | null;
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
  // Grow with the rows and virtualise against the page viewport; horizontal overflow stays in the grid.
  flow?: boolean;
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
  // Phones keep secondary columns available by scrolling sideways; complete text uses the visible primary width.
  const phone = useMediaQuery(phoneQuery);
  const shown = useMemo(() => fitColumns(cols, width, phone), [cols, phone, width]);
  // Groups count as rows for the height, the virtual row count and the reveal offset; a folded group's children do not.
  const flat = useMemo(
    () => (tree ? rows.flatMap(row => (isGroup(row) ? (tree.collapsed(row.group) ? [row] : [row, ...row.children]) : [row])) : rows),
    [rows, tree]
  );
  const groups = useMemo(() => (tree ? rows.filter(isGroup) : noGroups), [rows, tree]);
  const groupKeys = useMemo(() => (tree ? groups.map(row => row.id) : undefined), [groups, tree]);
  const expandedKeys = useMemo(() => (tree ? groups.filter(row => !tree.collapsed(row.group)).map(row => row.id) : undefined), [groups, tree]);
  const multiline = shown.some(column => column.text === 'wrap');
  const fitted = useTableHeight(flow ? Infinity : height, flat.length, loading, fit || flow);
  const [virtual, setVirtual] = useState(flow || stream || flat.length >= virtualiseFrom);
  if (!virtual && flat.length >= virtualiseFrom) setVirtual(true);
  const at = reveal && selected ? flat.findIndex(r => r.id === selected) : -1;
  // A virtualised grid scrolls itself, a native table its container; the virtual height lands a frame later.
  const grid = useRef<HTMLElement>(null);
  const scrollFrame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!phone) return;
    const frame = scrollFrame.current;
    const scroller = virtual || tree ? grid.current : ref.current;
    if (!frame || !scroller) return;
    const rtl = getComputedStyle(scroller).direction === 'rtl';
    const fade = () => {
      const from = Math.abs(scroller.scrollLeft);
      const start = from > 1;
      const end = from < scroller.scrollWidth - scroller.clientWidth - 1;
      const sides = [(rtl ? end : start) && 'left', (rtl ? start : end) && 'right'].filter(Boolean).join(' ');
      if (sides) frame.dataset.fade = sides;
      else delete frame.dataset.fade;
    };
    fade();
    const observer = new ResizeObserver(fade);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    scroller.addEventListener('scroll', fade, {passive: true});
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', fade);
    };
  }, [phone, virtual, tree, shown, ref]);
  const detailRef = useRef<HTMLDivElement>(null);
  const [restoreKey, setRestoreKey] = useState<string | null>(null);
  const [layout] = useState(() => new TableLayout());
  useTableReveal(
    reveal ? (selected ?? null) : null,
    at,
    virtual ? grid : ref,
    flow,
    multiline
      ? key => {
          if (virtual) return layout.getLayoutInfo(key)?.rect ?? null;
          const box = ref.current;
          const row = Array.from(box?.querySelectorAll<HTMLElement>('[role="row"][data-key]') ?? []).find(row => row.dataset.key === key);
          if (!box || !row) return null;
          const bounds = row.getBoundingClientRect();
          return {y: bounds.top - box.getBoundingClientRect().top + box.scrollTop, height: bounds.height};
        }
      : undefined
  );
  useTableFlow(flow, stream, flat, grid, detailRef, tableLayout.headingHeight, tableLayout.rowHeight);
  useEffect(() => {
    if (!detail || !selected || flat.some(row => row.id === selected)) return;
    if (document.activeElement === document.body) grid.current?.focus({preventScroll: true});
    onSelect?.(null);
  }, [detail, selected, flat, onSelect]);
  useEffect(() => {
    const box = grid.current;
    if (!restoreKey || !box) return;
    const at = flat.findIndex(row => row.id === restoreKey);
    const restore = () => {
      const row = box.querySelector<HTMLElement>(`[data-key="${CSS.escape(restoreKey)}"]`);
      if (!row) return;
      row.focus({preventScroll: true});
      setRestoreKey(null);
    };
    const observer = new MutationObserver(restore);
    observer.observe(box, {childList: true, subtree: true});
    // Closing the panel changes the page height; reveal after that layout, then wait for virtualisation.
    const frame = requestAnimationFrame(() => {
      if (at < 0) {
        box.focus({preventScroll: true});
        setRestoreKey(null);
        return;
      }
      const top = tableLayout.headingHeight + at * tableLayout.rowHeight;
      revealFlowRow(box, top, top + tableLayout.rowHeight);
      restore();
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [restoreKey, flat]);
  useOpenerFocus(ref);
  const hasRows = rows.length > 0;
  // React Aria counts every row of the collection, folded children included; a tree counts what it shows.
  const rowCount = tree && virtual ? flat.length + 1 : undefined;
  const table = useMemo(() => {
    // Tree cells wrap their content so it truncates inside the flex cell.
    const content = (cell: ReactNode) => (tree ? <span className="cell">{text(cell)}</span> : text(cell));
    const renderRow = (row: T) => {
      return (
        <Row key={row.id} id={row.id} textValue={getTextValue?.(row)} data-highlighted={row.id === highlighted || undefined}>
          {shown.map(column => (
            <Cell key={column.id} className={cx(column.actions && 'rp-cell-actions', column.text === 'wrap' && 'rp-cell-wrap')}>
              {column.text === 'wrap' ? column.render(row) : content(column.render(row))}
            </Cell>
          ))}
        </Row>
      );
    };
    const renderGroup = (row: TableGroup<T>) => {
      const firstTotal = shown.findIndex((column, index) => index > 0 && row.totals[column.id] != null);
      const labelSpan = firstTotal < 0 ? shown.length : firstTotal;
      return (
        <Row key={row.id} id={row.id} textValue={row.label}>
          {shown
            .filter((_, index) => index === 0 || index >= labelSpan)
            .map((column, index) => (
              <Cell key={column.id} colSpan={index === 0 ? labelSpan : undefined}>
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
    };
    return (
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
        aria-rowcount={rowCount}
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
        <TableColumns cols={shown} firstVisibleHeader={!!tree} resizable={hasRows} />
        <TableRows<T | TableGroup<T>>
          dependencies={[shown, getTextValue, highlighted]}
          renderEmptyState={() => (
            <div className="rp-table-empty" style={{width: width ?? '100%'}}>
              {loading ? <Loading /> : <Empty>{empty ?? t('ui.empty')}</Empty>}
            </div>
          )}
        >
          {row => (tree && isGroup(row) ? renderGroup(row) : renderRow(row as T))}
        </TableRows>
      </Table>
    );
  }, [
    tree,
    getTextValue,
    highlighted,
    shown,
    virtual,
    treeGridRef,
    label,
    rowCount,
    expandedKeys,
    groups,
    groupKeys,
    onSelect,
    selectOnFocus,
    keys,
    detail,
    sort,
    onSort,
    hasRows,
    width,
    loading,
    empty,
    t
  ]);
  const layoutOptions = useMemo(
    () => (multiline ? {estimatedRowHeight: tableLayout.rowHeight, headingHeight: tableLayout.headingHeight} : tableLayout),
    [multiline]
  );
  const body = <RowsContext.Provider value={rows}>{table}</RowsContext.Provider>;
  const container = (
    <ResizableTableContainer
      ref={element => {
        ref.current = element;
      }}
      className="rp-table"
      data-flow={flow || undefined}
      data-row-detail={rowDetail || detail ? '' : undefined}
      data-multiline={multiline || undefined}
      style={multiline && !virtual && !flow ? {height: 'auto', maxHeight: height} : {height: fitted}}
      // RAC (1.21) keeps Home/End inside the row while a cell or a control in one has focus, which is where a click on
      // cut text leaves it. Focus the row and re-dispatch there so the cell cannot handle the original event.
      // The container passes no key handlers, so tree and flow modes render their own div to catch the key first.
      render={
        tree || flow
          ? props => (
              <div
                {...props}
                onKeyDownCapture={event => {
                  if (!['Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                  const row = (event.target as HTMLElement).closest<HTMLElement>('[role="row"][data-key]');
                  if (!row) return;
                  // Toggle selection changes focus without RAC cancelling the browser's page scroll.
                  if (flow && !(event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) event.preventDefault();
                  if (event.key !== 'Home' && event.key !== 'End') return;
                  if (event.target === row) return;
                  event.preventDefault();
                  event.stopPropagation();
                  row.focus({preventScroll: true});
                  row.dispatchEvent(new KeyboardEvent(event.nativeEvent.type, event.nativeEvent));
                }}
              />
            )
          : undefined
      }
    >
      {virtual ? (
        <Virtualizer layout={layout} layoutOptions={layoutOptions}>
          {body}
        </Virtualizer>
      ) : (
        body
      )}
    </ResizableTableContainer>
  );
  const scrolling = phone ? (
    <div ref={scrollFrame} className="rp-table-scroll">
      {container}
    </div>
  ) : (
    container
  );
  if (!detail) return scrolling;
  const open = selected ? flat.find(row => row.id === selected && !isGroup(row)) : undefined;
  return (
    <>
      {scrolling}
      {/* Always mounted, so the text it takes is announced; empty, it takes no room. */}
      <div ref={detailRef} className="rp-table-detail" data-flow={flow || undefined} aria-live="polite">
        {open && (
          <>
            {flow && (
              <RButton
                className={buttonClass({quiet: true, small: true})}
                aria-label={t('ui.close')}
                onPress={() => {
                  grid.current?.focus({preventScroll: true});
                  setRestoreKey(selected ?? null);
                  onSelect?.(null);
                }}
              >
                {t('ui.close')}
              </RButton>
            )}
            {detail(open as T)}
          </>
        )}
      </div>
    </>
  );
}
