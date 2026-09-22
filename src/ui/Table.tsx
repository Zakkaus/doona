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
  type Selection
} from 'react-aria-components';
import {useT} from '../i18n';
import ChevronDown from './icons/ChevronDown';
import {useContentWidth} from './hooks';
import {TextTooltip} from './Button';
import {Loading} from './Feedback';

// Minima include padding; positive drop priorities yield in ascending order when columns cannot fit.
type Col = {id: string; label: string; minWidth: number; grow?: number; isRowHeader?: boolean; align?: 'end'; drop?: number; sortable?: boolean};
export type TableSort = {column: string; direction: 'ascending' | 'descending'};
export type TableColumn<T> = Col & {render: (row: T) => ReactNode};

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
    const frame = requestAnimationFrame(() => {
      const box = ref.current;
      if (!box) return;
      const top = tableLayout.headingHeight + at * tableLayout.rowHeight;
      const bottom = top + tableLayout.rowHeight;
      if (top < box.scrollTop + tableLayout.headingHeight) box.scrollTop = top - tableLayout.headingHeight;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    });
    return () => cancelAnimationFrame(frame);
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

// Heights match tables-forms.css: a row is a fixed 40px; the heading is 8px padding twice, a 20px line and a 1px border.
export const tableLayout = {rowHeight: 40, headingHeight: 37};
const virtualiseFrom = 40;
// Once virtualised, keep the grid mounted to preserve focus, scroll and column widths.
export function DataTable<T extends {id: string}>({
  label,
  cols,
  rows,
  height = 442,
  selected,
  onSelect,
  selectOnFocus,
  reveal,
  empty,
  loading,
  sort,
  onSort,
  getTextValue,
  stream
}: {
  label: string;
  cols: TableColumn<T>[];
  rows: T[];
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
  // Rows arrive continuously (logs, events): virtualised from the start rather than on crossing a threshold.
  stream?: boolean;
}) {
  const t = useT();
  const keys: Selection = selected ? new Set([selected]) : new Set();
  const [ref, width] = useContentWidth<HTMLElement>();
  const shown = useMemo(() => fitColumns(cols, width), [cols, width]);
  // Include the border-box frame to avoid a two-pixel scroll on short tables.
  const frame = 2;
  // A table that has shown its full height while loading keeps it: growing from two rows to full height, or
  // shrinking back when few rows arrive, moves everything below it on the page.
  const [reserved, setReserved] = useState(loading && !rows.length);
  if (!reserved && loading && !rows.length) setReserved(true);
  const content = frame + tableLayout.headingHeight + Math.max(rows.length, 2) * tableLayout.rowHeight;
  const fitted = reserved ? height : Math.min(height, content);
  const [virtual, setVirtual] = useState(stream || rows.length >= virtualiseFrom);
  if (!virtual && rows.length >= virtualiseFrom) setVirtual(true);
  const at = reveal && selected ? rows.findIndex(r => r.id === selected) : -1;
  // A virtualized grid scrolls itself, a native table its container; the virtual height lands a frame later.
  const grid = useRef<HTMLElement>(null);
  useTableReveal(reveal ? (selected ?? null) : null, at, virtual ? grid : ref);
  const renderRow = (row: T) => {
    return (
      <Row key={row.id} id={row.id} textValue={getTextValue?.(row)}>
        {shown.map(column => {
          const cell = column.render(row);
          return (
            <Cell key={column.id} className={column.align}>
              {typeof cell === 'string' ? <TextTooltip>{cell}</TextTooltip> : cell}
            </Cell>
          );
        })}
      </Row>
    );
  };
  const table = (
    <Table
      ref={element => {
        grid.current = element;
      }}
      aria-label={label}
      aria-rowcount={virtual ? rows.length + 1 : undefined}
      selectionMode={onSelect ? 'single' : 'none'}
      selectionBehavior={selectOnFocus ? 'replace' : 'toggle'}
      selectedKeys={keys}
      onSelectionChange={keys => onSelect?.(selectedRow(keys))}
      disallowEmptySelection={!!onSelect}
      sortDescriptor={sort ? {column: sort.column, direction: sort.direction} : undefined}
      onSortChange={descriptor => onSort && descriptor.direction && onSort({column: String(descriptor.column), direction: descriptor.direction})}
    >
      <TableColumns cols={shown} />
      <TableBody<T>
        items={rows}
        dependencies={[shown, getTextValue]}
        renderEmptyState={() => (
          <div className="rp-table-empty" style={{width: width ?? '100%'}}>
            {loading ? <Loading /> : <div className="rp-empty">{empty ?? t('ui.empty')}</div>}
          </div>
        )}
      >
        {renderRow}
      </TableBody>
    </Table>
  );
  const container = (
    <ResizableTableContainer
      ref={element => {
        ref.current = element;
      }}
      className="rp-table"
      style={{height: fitted}}
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
  return container;
}
