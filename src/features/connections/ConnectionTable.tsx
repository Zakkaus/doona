import {useLayoutEffect, useMemo, useRef, type ComponentProps, type ReactNode} from 'react';
import {useT} from '../../i18n';
import {NodeName} from '../../ui/NodeName';
import {Badge, DataTable, TextTooltip, TimeCell, useFillHeight, RuleRef, type TableColumn} from '../../ui/ui';
import {columns, connectionId, connectionKey, isCollapsed, type ConnectionView, type GroupCollapse} from './viewState';
import type {ConnectionRowView, ConnectionTableRow} from './tableRows';
import {QuickRuleButton} from '../shared/RuleDialog';
import type {ConnectionRowRule} from './useConnectionRule';

type Props = Pick<ComponentProps<typeof DataTable<ConnectionRowView>>, 'loading' | 'selected' | 'onSelect' | 'selectOnFocus' | 'onSort'> & {
  view: ConnectionView;
  collection: ConnectionTableRow[];
  collapse: GroupCollapse;
  onToggleGroup: (group: string) => void;
  rule: ConnectionRowRule;
};
const target = (c: ConnectionRowView) => c.target;

export function ConnectionTable({collection, view, collapse, onToggleGroup, loading, selected, onSelect, selectOnFocus, onSort, rule}: Props) {
  const t = useT();
  const [ref, height] = useFillHeight<HTMLDivElement>(442);
  const latest = useRef(rule);
  useLayoutEffect(() => {
    latest.current = rule;
  });
  const definitions = useMemo((): TableColumn<ConnectionRowView>[] => {
    const renderers: Record<string, (c: ConnectionRowView) => ReactNode> = {
      dst: c => <TextTooltip>{c.target}</TextTooltip>,
      src: c => <TextTooltip className="rp-code">{c.source}</TextTooltip>,
      node: c =>
        c.nodeName ? (
          <NodeName name={c.node} className="rp-chain" text={c.path ?? undefined} />
        ) : (
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
      downRate: c => c.downloadRate,
      age: c => <TimeCell at={c.startedAt} />
    };
    return [
      ...columns.filter(c => !view.hidden.includes(c.id)).map(c => ({...c, label: t(c.label), grow: 1, render: renderers[c.id]})),
      {
        id: 'actions',
        actions: true,
        label: t('ui.actions'),
        minWidth: 88,
        grow: 0,
        render: c => {
          const action = latest.current;
          const disabled = !action.canAdd(c.seed);
          return <QuickRuleButton label={action.label(c.target)} disabled={disabled} tip={action.noTarget} onPress={() => latest.current.open(c.seed)} />;
        }
      }
    ];
  }, [view.hidden, t]);
  // Ungrouped connections are the rows themselves, which keep their identity across polls.
  const rows = useMemo(() => collection.map(row => ('connection' in row ? row.connection : row)), [collection]);
  const tree = useMemo(
    () => ({grouped: view.group !== 'none', collapsed: (group: string) => isCollapsed(collapse, group), onToggle: onToggleGroup}),
    [view.group, collapse, onToggleGroup]
  );
  return (
    <div ref={ref}>
      <DataTable
        label={t('nav.connections')}
        rowDetail
        cols={definitions}
        rows={rows}
        height={height}
        selected={selected && connectionKey(selected)}
        onSelect={onSelect && (key => onSelect(key && connectionId(key)))}
        selectOnFocus={selectOnFocus}
        reveal
        empty={t('conn.empty')}
        loading={loading}
        sort={view.sort && {column: String(view.sort.column), direction: view.sort.direction}}
        onSort={onSort}
        getTextValue={target}
        stream
        tree={tree}
      />
    </div>
  );
}
