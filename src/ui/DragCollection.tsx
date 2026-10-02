import type {ComponentProps, ReactNode} from 'react';
import {Button, DropZone, GridList, GridListItem, ListLayout, Virtualizer, type Selection} from 'react-aria-components';
import {useDragAndDrop} from './dragAndDrop';
import {cardClass} from './Card';
import {buttonClass, TextTooltip} from './Button';
import {Check} from './Check';
import {Empty} from './Feedback';
import DragHandle from './icons/DragHandle';
import {cx} from './cx';
import {NodeName} from './NodeName';

export function DropCard(props: Pick<ComponentProps<typeof DropZone>, 'aria-label' | 'isDisabled' | 'getDropOperation' | 'onDrop' | 'children'>) {
  return <DropZone {...props} className={cardClass('rp-drop')} />;
}

type DragRow = {id: string; label: string; meta: string; nodeName?: boolean};
export function DragCollection<T extends DragRow>({
  rows,
  labelledBy,
  selected,
  onSelectionChange,
  getItems,
  isDisabled,
  empty,
  dragLabel
}: {
  rows: T[];
  labelledBy: string;
  selected: Selection;
  onSelectionChange: (keys: Selection) => void;
  getItems: NonNullable<Parameters<typeof useDragAndDrop>[0]['getItems']>;
  isDisabled?: boolean;
  empty: ReactNode;
  dragLabel: (row: T) => string;
}) {
  const {dragAndDropHooks} = useDragAndDrop({getItems, getAllowedDropOperations: () => ['copy'], isDisabled});
  return (
    <Virtualizer layout={ListLayout} layoutOptions={{rowHeight: 48}}>
      <GridList
        aria-labelledby={labelledBy}
        className="rp-tray-list"
        items={rows}
        selectionMode="multiple"
        selectionBehavior="toggle"
        selectedKeys={selected}
        onSelectionChange={onSelectionChange}
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => <Empty>{empty}</Empty>}
      >
        {row => (
          <GridListItem id={row.id} textValue={row.label} className="rp-item rp-tray-row">
            <Button slot="drag" className={cx(buttonClass({quiet: true, icon: true, small: true}), 'rp-drag')} aria-label={dragLabel(row)}>
              <DragHandle />
            </Button>
            <Check />
            <span className="rp-grow">
              {row.nodeName ? <NodeName name={row.label} /> : <TextTooltip>{row.label}</TextTooltip>}
              <span className="desc">{row.meta}</span>
            </span>
          </GridListItem>
        )}
      </GridList>
    </Virtualizer>
  );
}
