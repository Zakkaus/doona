import {useMemo, type ReactNode} from 'react';
import {GridList, ListLayout, Virtualizer, type Selection} from 'react-aria-components';
import {useT} from '../i18n';
import {CardViewItem} from './CardView';
import {Empty, SkeletonBody} from './Feedback';
import {Kv} from './Kv';
import type {TableColumn} from './Table';
import {selectedRow} from './tableHooks';
import './styles/table-cards.css';

// A table's rows on a phone, one S2 card each, for a table whose columns cannot share a phone's width: the row header
// is the card's title with the actions column at its end, and every other column is a labelled fact under it, two to a
// row unless the column is `wide`. The list keeps the table's height and virtualises like it, so a phone draws only
// the cards in view. A press selects as a table row does, and a second press clears it.
const cardHeight = 196;
export function TableCards<T extends {id: string}>({
  label,
  cols,
  rows,
  getTextValue,
  height = 442,
  selected,
  onSelect,
  loading,
  empty
}: {
  label: string;
  cols: TableColumn<T>[];
  rows: T[];
  getTextValue: (row: T) => string;
  height?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  loading?: boolean;
  empty?: string;
}) {
  const t = useT();
  const keys: Selection = useMemo(() => (selected ? new Set([selected]) : new Set()), [selected]);
  if (loading && !rows.length) return <SkeletonBody shape="cards" count={2} height={cardHeight} />;
  return (
    <Virtualizer layout={ListLayout} layoutOptions={{estimatedRowSize: cardHeight, gap: 8}}>
      <GridList
        className="rp-table-cards"
        aria-label={label}
        items={rows}
        dependencies={[cols]}
        style={{maxHeight: height}}
        selectionMode={onSelect ? 'single' : 'none'}
        selectionBehavior="toggle"
        selectedKeys={keys}
        onSelectionChange={keys => onSelect?.(selectedRow(keys))}
        renderEmptyState={() => <Empty>{empty ?? t('ui.empty')}</Empty>}
      >
        {row => <TableCard row={row} cols={cols} title={getTextValue(row)} />}
      </GridList>
    </Virtualizer>
  );
}

export function TableCard<T extends {id: string}>({row, cols, title}: {row: T; cols: TableColumn<T>[]; title: string}) {
  const header = cols.find(column => column.isRowHeader) ?? cols[0];
  const actions = cols.find(column => column.actions);
  const facts = cols.filter(column => column !== header && column !== actions);
  return (
    <CardViewItem id={row.id} title={title} actions={actions?.render(row)}>
      <Kv items={facts.map(column => ({label: column.label, value: column.render(row) as ReactNode, wide: column.wide}))} />
    </CardViewItem>
  );
}
