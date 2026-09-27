import {useMemo, type ComponentProps, type ReactNode} from 'react';
import {useT} from '../../i18n';
import {Badge, DataTable, TextTooltip, TimeCell, useFillHeight, RuleRef} from '../../ui/ui';
import {
  columns,
  connectionId,
  connectionKey,
  isCollapsed,
  type ConnectionView,
  type ConnectionRowView,
  type ConnectionTableRow,
  type GroupCollapse
} from './view';

type Props = Pick<ComponentProps<typeof DataTable<ConnectionRowView>>, 'loading' | 'selected' | 'onSelect' | 'selectOnFocus' | 'onSort'> & {
  view: ConnectionView;
  collection: ConnectionTableRow[];
  collapse: GroupCollapse;
  onToggleGroup: (group: string) => void;
};
const target = (c: ConnectionRowView) => c.target;

export function ConnectionTable({collection, view, collapse, onToggleGroup, loading, selected, onSelect, selectOnFocus, onSort}: Props) {
  const t = useT();
  const [ref, height] = useFillHeight<HTMLDivElement>(442);
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
      downRate: c => c.downloadRate,
      age: c => <TimeCell at={c.startedAt} />
    };
    return columns.filter(c => !view.hidden.includes(c.id)).map(c => ({...c, label: t(c.label), grow: 1, render: renderers[c.id]}));
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
