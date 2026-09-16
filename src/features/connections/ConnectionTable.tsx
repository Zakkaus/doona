import {useEffect, useMemo, useRef} from 'react';
import {Cell, Column, Row, Table, TableBody, TableHeader, TableLayout, Virtualizer} from 'react-aria-components';
import {chainLabel, connectionStates, relativeStart} from '../../api/selectors';
import type {Connection} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {LOCALE, useLang, useT} from '../../i18n';
import {Badge} from '../../ui/ui';

import {columns, tableRows, type ConnectionView} from './view';
// Match the native table's measured row and collapsed-border header heights.
const layoutOptions = {rowHeight: 40, headingHeight: 36.5};

export function ConnectionTable({
  rows,
  selected,
  onSelect,
  view,
  onSort
}: {
  rows: Connection[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  view: ConnectionView;
  onSort: (sort: NonNullable<ConnectionView['sort']>) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const items = useMemo(() => tableRows(rows, view, locale), [rows, view, locale]);
  const flatRows = useMemo(() => items.flatMap(row => ('group' in row ? [null, ...row.children] : [row.connection])), [items]);
  const cols = columns.filter(column => !view.hidden.includes(column.id));
  const ref = useRef<HTMLDivElement | HTMLTableElement>(null);
  const selectedIndex = flatRows.findIndex(row => row?.id === selected);
  useEffect(() => {
    // Wait for RAC to commit the virtual content height before revealing a deep link.
    const frame = requestAnimationFrame(() => {
      const table = ref.current;
      if (!table || selectedIndex < 0) return;
      const top = layoutOptions.headingHeight + selectedIndex * layoutOptions.rowHeight;
      const bottom = top + layoutOptions.rowHeight;
      if (top < table.scrollTop + layoutOptions.headingHeight) table.scrollTop = top - layoutOptions.headingHeight;
      else if (bottom > table.scrollTop + table.clientHeight) table.scrollTop = bottom - table.clientHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);
  const renderConnection = (c: Connection) => {
    const cells: Record<string, React.ReactNode> = {
      dst: c.domain || c.dst || '—',
      src: <span className="rp-code">{c.src ?? '—'}</span>,
      chain: chainLabel(c),
      rule: (
        <span className="rp-rule">
          <span title={c.rule_expression ?? undefined}>{c.rule_expression ?? '—'}</span>
          {c.rule_source === 'recomputed' ? <Badge>{t('conn.recomputed')}</Badge> : c.rule_source === 'unknown' ? <Badge>—</Badge> : null}
        </span>
      ),
      state: t(connectionStates[c.state]),
      down: formatBytes(c.download_bytes),
      age: relativeStart(c.started_at, locale)
    };
    return (
      <Row key={c.id} id={c.id} textValue={c.domain || c.dst || c.id}>
        {cols.map(column => (
          <Cell key={column.id} className={column.align}>
            <span className="cell">{cells[column.id]}</span>
          </Cell>
        ))}
      </Row>
    );
  };
  return (
    <div
      className="rp-table"
      onKeyDownCapture={event => {
        // RAC scopes Home/End to cells unless the row itself has focus.
        if (event.key === 'Home' || event.key === 'End') {
          (event.target as HTMLElement).closest<HTMLElement>('[role="row"][data-key]')?.focus({preventScroll: true});
        }
      }}
    >
      <Virtualizer layout={TableLayout} layoutOptions={layoutOptions}>
        <Table
          ref={ref}
          aria-label={t('nav.connections')}
          aria-rowcount={flatRows.length + 1}
          expandedKeys={items.flatMap(row => ('group' in row ? [row.id] : []))}
          treeColumn={view.group === 'none' ? undefined : cols[0].id}
          sortDescriptor={view.sort ?? undefined}
          onSortChange={onSort}
          disabledKeys={items.flatMap(row => ('group' in row ? [row.id] : []))}
          selectionMode="single"
          selectionBehavior="replace"
          selectedKeys={selected ? [selected] : []}
          onSelectionChange={keys => onSelect(keys === 'all' || !keys.size ? null : String([...keys][0]))}
          disallowEmptySelection
        >
          <TableHeader>
            {cols.map((c, index) => (
              <Column key={c.id} id={c.id} isRowHeader={index === 0} allowsSorting={c.sortable} width={`${c.width}fr`} minWidth={c.width} className={c.align}>
                {({sortDirection}) => (
                  <>
                    {t(c.label)}
                    {sortDirection && <span aria-hidden="true">{sortDirection === 'ascending' ? ' ↑' : ' ↓'}</span>}
                  </>
                )}
              </Column>
            ))}
          </TableHeader>
          <TableBody items={items} dependencies={[locale, view.hidden, view.group]} renderEmptyState={() => <div className="empty">{t('conn.empty')}</div>}>
            {row => {
              if ('group' in row)
                return (
                  <Row id={row.id} textValue={row.group}>
                    {cols.map((column, index) => (
                      <Cell key={column.id}>
                        <span className="cell">{index === 0 ? <strong>{t('conn.groupCount', {name: row.group, n: row.children.length})}</strong> : null}</span>
                      </Cell>
                    ))}
                    {row.children.map(renderConnection)}
                  </Row>
                );
              return renderConnection(row.connection);
            }}
          </TableBody>
        </Table>
      </Virtualizer>
    </div>
  );
}
