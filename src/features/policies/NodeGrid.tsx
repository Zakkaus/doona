import {GridLayout, GridList, GridListItem, Size, ToggleButton, Virtualizer} from 'react-aria-components';
import {useCallback, useState, type ReactNode} from 'react';
import {NodeTile, type NodeStatus} from '../../ui/Tile';
import {Empty} from '../../ui/Feedback';
import {cx} from '../../ui/cx';
import {useContentWidth} from '../../ui/hooks';

// The tallest the scroll panel grows, as `.rp-nodegrid` sets it in nodes.css.
const panelHeight = 376;

// Columns as `.rp-nodes` lays them out, kept for a short filter result too, so its tiles line up with every other
// group's; the panel keeps its scroll height only when the rows overflow it.
export function nodeGridSize(width: number, gap: number, count: number) {
  const columns = Math.max(1, Math.floor((width - gap) / (228 + gap)));
  const rows = Math.ceil(count / columns);
  return {columns, width: Math.max(228, (width - gap * (columns + 1)) / columns), overflows: gap + rows * (56 + gap) > panelHeight};
}

export type GridNode = {id: string; name: string; nodeName: boolean; status: NodeStatus; description: string};
type NodeGridProps = {
  nodes: GridNode[];
  label: string;
  empty: string;
  virtual?: boolean;
  selected?: string;
  current?: string;
  marks?: Record<string, string>;
  onSelect?: (id: string) => void;
  isDisabled?: boolean;
};

// A stable default, so a grid without marks keeps its collection cache between renders.
const noMarks: Record<string, string> = {};

export function NodeGrid({nodes, label, empty, virtual, selected, current, marks = noMarks, onSelect, isDisabled}: NodeGridProps) {
  const selectable = !!onSelect;
  const tile = useCallback(
    (n: GridNode) => (
      <NodeTile
        nodeName={n.nodeName}
        name={n.name}
        status={n.status}
        description={n.description}
        current={!selectable && current === n.id}
        mark={marks[n.id]}
      />
    ),
    [selectable, current, marks]
  );
  if (!virtual)
    return (
      <div className="rp-nodes">
        {nodes.map(n =>
          onSelect ? (
            <ToggleButton
              key={n.id}
              className={cx('rp-node', marks[n.id] && 'cur')}
              isSelected={selected === n.id}
              isDisabled={isDisabled}
              onChange={() => onSelect(n.id)}
            >
              {tile(n)}
            </ToggleButton>
          ) : (
            <div key={n.id} className={cx('rp-node', current === n.id && 'cur')}>
              {tile(n)}
            </div>
          )
        )}
      </div>
    );
  return (
    <VirtualNodeGrid
      nodes={nodes}
      label={label}
      empty={empty}
      selected={selected}
      current={current}
      marks={marks}
      onSelect={onSelect}
      isDisabled={isDisabled}
      renderTile={tile}
    />
  );
}

function VirtualNodeGrid({
  nodes,
  label,
  empty,
  selected,
  current,
  marks = noMarks,
  onSelect,
  isDisabled,
  renderTile
}: Omit<NodeGridProps, 'virtual'> & {renderTile: (node: GridNode) => ReactNode}) {
  const [gap] = useState(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rp-space-2')));
  const [gridRef, width] = useContentWidth<HTMLDivElement>();
  const size = nodeGridSize(width ?? 228 + gap * 2, gap, nodes.length);
  return (
    <Virtualizer
      layout={GridLayout}
      layoutOptions={{minItemSize: new Size(228, 56), maxItemSize: new Size(size.width, 56), minSpace: new Size(gap, gap), maxColumns: size.columns}}
    >
      <GridList
        ref={gridRef}
        className="rp-nodegrid"
        data-fit={size.overflows ? undefined : true}
        aria-label={label}
        items={nodes}
        // The collection caches each row's rendering by item; what a row reads besides the item is declared here.
        dependencies={[current, marks, onSelect, renderTile]}
        selectionMode={onSelect ? 'single' : 'none'}
        disabledKeys={isDisabled ? nodes.map(node => node.id) : []}
        disallowEmptySelection
        selectedKeys={onSelect && selected ? [selected] : []}
        onSelectionChange={keys => {
          if (!onSelect || isDisabled || keys === 'all') return;
          const id = [...keys][0];
          if (id != null) onSelect(String(id));
        }}
        renderEmptyState={() => <Empty>{empty}</Empty>}
      >
        {n => (
          <GridListItem id={n.id} textValue={n.name} className={cx('rp-node', ((!onSelect && current === n.id) || marks[n.id]) && 'cur')}>
            {renderTile(n)}
          </GridListItem>
        )}
      </GridList>
    </Virtualizer>
  );
}
