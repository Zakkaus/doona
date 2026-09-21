import {useMemo, type ComponentProps, type ReactNode} from 'react';
import {Table, ResizableTableContainer, TableBody, Row, Cell, Virtualizer, TableLayout} from 'react-aria-components';
import {chainLabel, connectionStates, relativeStart, type OutboundNames} from '../../api/selectors';
import {useCapabilities} from '../../api/store';
import type {Connection} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {LOCALE, useLang, useT} from '../../i18n';
import {Badge, DataTable, TextTooltip, useFillHeight, useContentWidth, RuleRef, Loading, type TableColumn} from '../../ui/ui';
import {TableColumns, fitColumns, selectedRow, tableLayout, useTableReveal} from '../../ui/Table';
import {columns, tableRows, type ConnectionView} from './view';

type Props = Pick<ComponentProps<typeof DataTable<Connection>>, 'rows' | 'loading' | 'selected' | 'onSelect' | 'selectOnFocus' | 'onSort'> & {
  view: ConnectionView;
  names: OutboundNames;
};
export function ConnectionTable({rows, view, names, loading, selected, onSelect, selectOnFocus, onSort}: Props) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [ref, height] = useFillHeight<HTMLDivElement>(442);
  const [gridRef, width] = useContentWidth<HTMLElement>();
  const rulesListed = useCapabilities().data?.resources.rules.available === true;
  const renderers: Record<string, (c: Connection) => ReactNode> = {
    dst: c => <TextTooltip>{c.domain || c.dst || '—'}</TextTooltip>,
    src: c => <TextTooltip className="rp-code">{c.src ?? '—'}</TextTooltip>,
    chain: c => <TextTooltip className="rp-chain">{chainLabel(c, t, names)}</TextTooltip>,
    rule: c => (
      <span className="rp-rule">
        <RuleRef expression={c.rule_expression} ruleId={c.rule_id} linked={rulesListed} />
        {c.rule_source === 'recomputed' && <Badge>{t('conn.recomputed')}</Badge>}
      </span>
    ),
    state: c => t(connectionStates[c.state]),
    down: c => formatBytes(c.download_bytes),
    age: c => relativeStart(c.started_at, locale)
  };
  const shown: TableColumn<Connection>[] = fitColumns(
    columns.filter(c => !view.hidden.includes(c.id)),
    width
  ).map(c => ({...c, label: t(c.label), grow: 1, render: renderers[c.id]}));
  const collection = useMemo(() => tableRows(rows, view, locale), [rows, view, locale]);
  const flatRows = collection.flatMap(row => ('connection' in row ? [row.connection] : [null, ...row.children]));
  const groupKeys = collection.filter(row => !('connection' in row)).map(row => row.id);
  useTableReveal(selected ? flatRows.findIndex(row => row?.id === selected) : -1, gridRef);
  const renderRow = (row: Connection) => (
    <Row key={row.id} id={row.id} textValue={row.domain || row.dst || row.id}>
      {shown.map(column => (
        <Cell key={column.id} className={column.align}>
          <span className="cell">{column.render(row)}</span>
        </Cell>
      ))}
    </Row>
  );
  return (
    <div
      ref={ref}
      onKeyDownCapture={event => {
        // RAC scopes Home/End to cells unless the row itself has focus.
        if (event.key === 'Home' || event.key === 'End')
          (event.target as HTMLElement).closest<HTMLElement>('[role="row"][data-key]')?.focus({preventScroll: true});
      }}
    >
      <ResizableTableContainer
        className="rp-table"
        style={{height: Math.min(height, 2 + tableLayout.headingHeight + Math.max(flatRows.length, 2) * tableLayout.rowHeight)}}
      >
        <Virtualizer layout={TableLayout} layoutOptions={tableLayout}>
          <Table
            ref={element => {
              gridRef.current = element;
            }}
            aria-label={t('nav.connections')}
            aria-rowcount={flatRows.length + 1}
            expandedKeys={groupKeys}
            disabledKeys={groupKeys}
            treeColumn={view.group === 'none' ? undefined : shown[0]?.id}
            selectionMode={onSelect ? 'single' : 'none'}
            selectionBehavior={selectOnFocus ? 'replace' : 'toggle'}
            selectedKeys={selected ? [selected] : []}
            onSelectionChange={keys => onSelect?.(selectedRow(keys))}
            disallowEmptySelection={!!onSelect}
            sortDescriptor={view.sort ?? undefined}
            onSortChange={descriptor => descriptor.direction && onSort?.({column: String(descriptor.column), direction: descriptor.direction})}
          >
            <TableColumns cols={shown} firstVisibleHeader />
            <TableBody
              items={collection}
              dependencies={[shown]}
              renderEmptyState={() => (loading ? <Loading /> : <div className="rp-empty">{t('conn.empty')}</div>)}
            >
              {row => {
                if ('connection' in row) return renderRow(row.connection);
                const totals: Record<string, ReactNode> = {down: formatBytes(row.download), state: t('conn.activeCount', {n: row.active})};
                return (
                  <Row id={row.id} textValue={row.group}>
                    {shown.map((column, index) => (
                      <Cell key={column.id} className={column.align}>
                        <span className="cell">
                          {index === 0 ? <strong>{t('conn.groupCount', {name: row.group, n: row.children.length})}</strong> : totals[column.id]}
                        </span>
                      </Cell>
                    ))}
                    {row.children.map(renderRow)}
                  </Row>
                );
              }}
            </TableBody>
          </Table>
        </Virtualizer>
      </ResizableTableContainer>
    </div>
  );
}
