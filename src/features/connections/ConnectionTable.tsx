/*
 * Groups stay expanded and cannot be selected; row counts and keyboard navigation include their slots.
 * Connections always virtualize, keep .cell wrappers, and give the first visible column grow 1.
 * Type-ahead uses each row's text value; deep-linked selections reveal their flattened row.
 */
import {useMemo, type ComponentProps} from 'react';
import {chainLabel, connectionStates, relativeStart, type OutboundNames} from '../../api/selectors';
import {useCapabilities} from '../../api/store';
import type {Connection} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {LOCALE, useLang, useT} from '../../i18n';
import {Badge, DataTable, TextTooltip, useFillHeight, RuleRef, type TableGroup} from '../../ui/ui';
import {columns, tableRows, type ConnectionView} from './view';

type Props = Pick<ComponentProps<typeof DataTable<Connection>>, 'rows' | 'loading' | 'selected' | 'onSelect' | 'selectOnFocus' | 'onSort'> & {
  view: ConnectionView;
  names: OutboundNames;
};
export function ConnectionTable({rows, view, names, ...props}: Props) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [ref, height] = useFillHeight<HTMLDivElement>(442);
  const rulesListed = useCapabilities().data?.resources.rules.available === true;
  const cols = useMemo(() => columns.filter(c => !view.hidden.includes(c.id)).map(c => ({...c, label: t(c.label), grow: 1})), [view.hidden, t]);
  const collection = useMemo(() => {
    const sorted: Connection[] = [];
    const groups: TableGroup<Connection>[] = [];
    for (const row of tableRows(rows, view, locale)) {
      if ('connection' in row) sorted.push(row.connection);
      else {
        const totals: Record<string, React.ReactNode> = {down: formatBytes(row.download), state: t('conn.activeCount', {n: row.active})};
        const label = <strong>{t('conn.groupCount', {name: row.group, n: row.children.length})}</strong>;
        groups.push({...row, textValue: row.group, render: (column, index) => (index === 0 ? label : totals[column.id])});
      }
    }
    return {rows: sorted, groups: view.group === 'none' ? undefined : groups};
  }, [rows, view, locale, t]);
  return (
    <div ref={ref}>
      <DataTable
        {...props}
        {...collection}
        label={t('nav.connections')}
        cols={cols}
        height={height}
        sort={view.sort ? {column: String(view.sort.column), direction: view.sort.direction ?? 'ascending'} : null}
        empty={t('conn.empty')}
        virtualization="always"
        rowHeader="first-visible"
        reveal
        getTextValue={c => c.domain || c.dst || c.id}
        render={c => {
          const cells: Record<string, React.ReactNode> = {
            dst: <TextTooltip>{c.domain || c.dst || '—'}</TextTooltip>,
            src: <TextTooltip className="rp-code">{c.src ?? '—'}</TextTooltip>,
            chain: <TextTooltip className="rp-chain">{chainLabel(c, t, names)}</TextTooltip>,
            rule: (
              <span className="rp-rule">
                <RuleRef expression={c.rule_expression} ruleId={c.rule_id} linked={rulesListed} />
                {c.rule_source === 'recomputed' && <Badge>{t('conn.recomputed')}</Badge>}
              </span>
            ),
            state: t(connectionStates[c.state]),
            down: formatBytes(c.download_bytes),
            age: relativeStart(c.started_at, locale)
          };
          return cols.map(column => <span className="cell">{cells[column.id]}</span>);
        }}
      />
    </div>
  );
}
