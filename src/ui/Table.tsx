import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
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
import {useContentWidth} from './hooks';
import {TextTooltip} from './Button';
import {Loading} from './Feedback';

// Column minima include cell padding; grow weights their fractional share (zero keeps the minimum).
// `drop` orders which columns give way first when the container is narrower than the minima add up to;
// a column without it always stays. Tables never scroll sideways on a desktop.
export type Col = {id: string; label: string; minWidth: number; grow?: number; isRowHeader?: boolean; align?: 'end'; drop?: number; sortable?: boolean};
export type TableSort = {column: string; direction: 'ascending' | 'descending'};

export function fitColumns<C extends {id: string; minWidth: number; drop?: number}>(cols: C[], width: number | null): C[] {
  if (width === null) return cols;
  const kept = new Set(cols.map(column => column.id));
  let total = cols.reduce((sum, column) => sum + column.minWidth, 0);
  for (const column of [...cols].filter(column => column.drop).sort((a, b) => a.drop! - b.drop!)) {
    if (total <= width) break;
    kept.delete(column.id);
    total -= column.minWidth;
  }
  return cols.filter(column => kept.has(column.id));
}

// Long lists are virtualised: only the visible rows are in the DOM, so a rule list of thousands stays light.
// Short ones render whole, which keeps every row reachable to assistive technology and find-in-page. A list
// that once reached the threshold stays virtualised for the life of the table, so a growing feed or a filter
// typed around the threshold does not remount the grid and lose focus, scroll and column widths.
// Row and header heights match theme.css (8px padding twice, 20px line, 1px border).
export const tableLayout = {rowHeight: 40, headingHeight: 37};
const virtualiseFrom = 200;
export function DataTable<T extends {id: string}>({
  label,
  cols,
  rows,
  render,
  height = 442,
  selected,
  onSelect,
  selectOnFocus,
  reveal,
  empty,
  loading,
  sort,
  onSort
}: {
  label: string;
  cols: Col[];
  rows: T[];
  render: (r: T) => ReactNode[];
  height?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  // Arrow keys select as they move (a list with its detail beside it); otherwise Enter or Space selects.
  selectOnFocus?: boolean;
  // Scroll the selected row into view when the selection arrives from outside (a deep link), whether or not
  // the row is in the DOM yet: rows have one fixed height, so the offset is known without measuring.
  reveal?: boolean;
  empty?: string;
  loading?: boolean;
  // Header clicks on sortable columns; the caller orders `rows`.
  sort?: TableSort | null;
  onSort?: (sort: TableSort) => void;
}) {
  const t = useT();
  const keys: Selection = selected ? new Set([selected]) : new Set();
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const shown = useMemo(() => fitColumns(cols, width), [cols, width]);
  const index = new Map(cols.map((column, i) => [column.id, i]));
  // A short list takes only the height of its rows; `height` is the ceiling before the table scrolls.
  // `.rp-table` is border-box with a 1px border top and bottom; the fit includes that frame so a short table
  // holds its rows without a 2px scroll.
  const frame = 2;
  const fitted = Math.min(height, frame + tableLayout.headingHeight + Math.max(rows.length, 2) * tableLayout.rowHeight);
  const [virtual, setVirtual] = useState(rows.length >= virtualiseFrom);
  if (!virtual && rows.length >= virtualiseFrom) setVirtual(true);
  const at = reveal && selected ? rows.findIndex(r => r.id === selected) : -1;
  // A virtualized grid scrolls itself, a native table its container; the virtual height lands a frame later.
  const grid = useRef<HTMLTableElement>(null);
  useEffect(() => {
    if (at < 0) return;
    const frame = requestAnimationFrame(() => {
      const box = virtual ? grid.current : ref.current;
      if (!box) return;
      const top = tableLayout.headingHeight + at * tableLayout.rowHeight;
      const bottom = top + tableLayout.rowHeight;
      if (top < box.scrollTop + tableLayout.headingHeight) box.scrollTop = top - tableLayout.headingHeight;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [at, virtual, ref]);
  const table = (
    <Table
      ref={grid}
      aria-label={label}
      selectionMode={onSelect ? 'single' : 'none'}
      selectionBehavior={selectOnFocus ? 'replace' : 'toggle'}
      selectedKeys={keys}
      onSelectionChange={k => onSelect && onSelect(k === 'all' ? null : k.size ? String([...k][0]) : null)}
      disallowEmptySelection={!!onSelect}
      sortDescriptor={sort ? {column: sort.column, direction: sort.direction} : undefined}
      onSortChange={descriptor => onSort && descriptor.direction && onSort({column: String(descriptor.column), direction: descriptor.direction})}
    >
      <TableHeader>
        {shown.map(c => (
          <Column
            key={c.id}
            id={c.id}
            isRowHeader={c.isRowHeader}
            allowsSorting={c.sortable}
            className={c.align === 'end' ? 'end' : undefined}
            defaultWidth={`${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr`}
            minWidth={c.minWidth}
          >
            {({sortDirection}) => (
              <>
                <span className="rp-th">
                  {c.label}
                  {sortDirection && <span aria-hidden="true">{sortDirection === 'ascending' ? ' ↑' : ' ↓'}</span>}
                </span>
                <ColumnResizer className="rp-resizer" aria-label={t('ui.resizeColumn', {name: c.label})} />
              </>
            )}
          </Column>
        ))}
      </TableHeader>
      <TableBody
        items={rows}
        dependencies={[shown, render]}
        renderEmptyState={() => (loading ? <Loading /> : <div className="rp-empty">{empty ?? t('ui.empty')}</div>)}
      >
        {r => {
          const cells = render(r);
          return (
            <Row id={r.id}>
              {shown.map(c => {
                const cell = cells[index.get(c.id)!];
                return (
                  <Cell key={c.id} className={c.align === 'end' ? 'end' : undefined}>
                    {typeof cell === 'string' ? <TextTooltip>{cell}</TextTooltip> : cell}
                  </Cell>
                );
              })}
            </Row>
          );
        }}
      </TableBody>
    </Table>
  );
  return (
    <ResizableTableContainer ref={ref} className="rp-table" style={{height: fitted}}>
      {virtual ? (
        <Virtualizer layout={TableLayout} layoutOptions={tableLayout}>
          {table}
        </Virtualizer>
      ) : (
        table
      )}
    </ResizableTableContainer>
  );
}
