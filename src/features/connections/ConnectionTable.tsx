import {useMemo, type ComponentProps, type ReactNode} from 'react';
import {Table, ResizableTableContainer, TableBody, Row, Cell, Virtualizer, TableLayout} from 'react-aria-components';
import {useT} from '../../i18n';
import {Badge, DataTable, TextTooltip, TimeCell, useFillHeight, useContentWidth, RuleRef, Loading, type TableColumn} from '../../ui/ui';
import {TableColumns, fitColumns, selectedRow, tableLayout, useTableHeight, useTableReveal} from '../../ui/Table';
import {columns, type ConnectionView, type ConnectionRowView, type ConnectionTableRow} from './view';

type Props = Pick<ComponentProps<typeof DataTable<ConnectionRowView>>, 'loading' | 'selected' | 'onSelect' | 'selectOnFocus' | 'onSort'> & {
  view: ConnectionView;
  collection: ConnectionTableRow[];
};
// Plain text truncates with a tooltip, as in DataTable.
const text = (cell: ReactNode) => (typeof cell === 'string' ? <TextTooltip>{cell}</TextTooltip> : cell);

export function ConnectionTable({collection, view, loading, selected, onSelect, selectOnFocus, onSort}: Props) {
  const t = useT();
  const [ref, height] = useFillHeight<HTMLDivElement>(442);
  const [gridRef, width] = useContentWidth<HTMLElement>();
  const definitions = useMemo(() => {
    const renderers: Record<string, (c: ConnectionRowView) => ReactNode> = {
      dst: c => <TextTooltip>{c.target}</TextTooltip>,
      src: c => <TextTooltip className="rp-code">{c.source}</TextTooltip>,
      node: c => (
        <TextTooltip className="rp-chain" text={c.path ?? undefined}>
          {c.node}
        </TextTooltip>
      ),
      rule: c => (
        <span className="rp-rule">
          <RuleRef {...c.rule} />
          {c.recomputed && <Badge>{c.recomputed}</Badge>}
        </span>
      ),
      state: c => c.state,
      down: c => c.download,
      age: c => <TimeCell at={c.startedAt} />
    };
    return columns.filter(c => !view.hidden.includes(c.id)).map(c => ({...c, label: t(c.label), grow: 1, render: renderers[c.id]}));
  }, [view.hidden, t]);
  const shown: TableColumn<ConnectionRowView>[] = useMemo(() => fitColumns(definitions, width), [definitions, width]);
  const flatRows = useMemo(() => collection.flatMap(row => ('connection' in row ? [row.connection] : [null, ...row.children])), [collection]);
  const fitted = useTableHeight(height, flatRows.length, loading);
  const selectedKeys = useMemo(() => (selected ? [selected] : []), [selected]);
  const groupKeys = useMemo(() => collection.filter(row => !('connection' in row)).map(row => row.id), [collection]);
  useTableReveal(selected ?? null, selected ? flatRows.findIndex(row => row?.id === selected) : -1, gridRef);
  const renderRow = (row: ConnectionRowView) => (
    <Row key={row.id} id={row.id} textValue={row.target}>
      {shown.map(column => (
        <Cell key={column.id} className={column.align}>
          <span className="cell">{text(column.render(row))}</span>
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
      <ResizableTableContainer className="rp-table" style={{height: fitted}}>
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
            selectedKeys={selectedKeys}
            onSelectionChange={keys => onSelect?.(selectedRow(keys))}
            disallowEmptySelection={!!onSelect}
            sortDescriptor={view.sort ?? undefined}
            onSortChange={descriptor => descriptor.direction && onSort?.({column: String(descriptor.column), direction: descriptor.direction})}
          >
            <TableColumns cols={shown} firstVisibleHeader />
            <TableBody
              items={collection}
              dependencies={[shown]}
              renderEmptyState={() => (
                <div className="rp-table-empty" style={{width: width ?? '100%'}}>
                  {loading ? <Loading /> : <div className="rp-empty">{t('conn.empty')}</div>}
                </div>
              )}
            >
              {row => {
                if ('connection' in row) return renderRow(row.connection);
                return (
                  <Row id={row.id} textValue={row.group}>
                    {shown.map((column, index) => (
                      <Cell key={column.id} className={column.align}>
                        <span className="cell">{index === 0 ? <strong>{row.label}</strong> : text(row.totals[column.id])}</span>
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
