import {useRef, type ReactNode} from 'react';
import {Button as RButton, DropIndicator, GridList, GridListItem, useDragAndDrop, type DragAndDropOptions, type GridListProps} from 'react-aria-components';
import {buttonClass} from './Button';
import {cx} from './cx';
import {tileAttributes, usePacking, type TileProps} from './DashboardTile';
import DragHandle from './icons/DragHandle';
import './styles/dashboard.css';
import './styles/sortable.css';
import './styles/widget-tile.css';

const type = 'application/x-doona-card';
const unpacked = {current: null};
export type CanvasPlace = {target?: string; after?: boolean};

// After a native drag ends, WebKit skips the pointerdown of the next press while its mousedown, pointerup and click
// still arrive, so React Aria's press handlers ignore that press and the first button pressed after a drop does
// nothing. Once per drag, a mousedown without a pointerdown before it gets the pointerdown WebKit left out.
function repairNextPress() {
  const done = () => {
    document.removeEventListener('pointerdown', done, true);
    document.removeEventListener('mousedown', repair, true);
  };
  const repair = (event: MouseEvent) => {
    done();
    const {clientX, clientY, screenX, screenY, button, buttons, ctrlKey, shiftKey, altKey, metaKey} = event;
    event.target?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        ...{clientX, clientY, screenX, screenY, button, buttons, ctrlKey, shiftKey, altKey, metaKey}
      })
    );
  };
  document.addEventListener('pointerdown', done, true);
  document.addEventListener('mousedown', repair, true);
}

export function reorderKeys(ids: string[], moved: Set<string>, target: string, position: 'before' | 'after') {
  if (moved.has(target)) return ids;
  const rest = ids.filter(id => !moved.has(id));
  const at = rest.indexOf(target);
  if (at < 0) return ids;
  rest.splice(at + (position === 'after' ? 1 : 0), 0, ...ids.filter(id => moved.has(id)));
  return rest;
}

// The one sortable canvas. With a profile it is a dashboard section in edit mode: the page's own cells, packed, each
// with a drag handle and the caller's tools in an overlay corner, so editing changes no box. Without one it is the
// panel editor's two-column grid of tiles. Every drop is a move, into this canvas from any other or within it, and
// `onPlace` receives it as one transaction. The drop indicator takes no cell: it is a line drawn beside the card it
// precedes or follows.
export function SortableCanvas<T extends TileProps>({
  label,
  profile,
  items,
  textValue,
  dragLabel,
  tools,
  children,
  onPlace,
  ...props
}: Pick<GridListProps<T>, 'selectionMode' | 'selectedKeys' | 'onSelectionChange'> & {
  label: string;
  profile?: string;
  items: T[];
  textValue: (item: T) => string;
  dragLabel: (item: T) => string;
  tools?: (item: T) => ReactNode;
  children: (item: T) => ReactNode;
  onPlace: (id: string, place: CanvasPlace) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePacking(profile ? ref : unpacked);
  const read = async (event: {items: Parameters<NonNullable<DragAndDropOptions['onRootDrop']>>[0]['items']}) => {
    for (const item of event.items) if (item.kind === 'text' && item.types.has(type)) return item.getText(type);
  };
  const {dragAndDropHooks} = useDragAndDrop({
    getItems: keys => [...keys].map(key => ({[type]: String(key), 'text/plain': textValue(items.find(item => item.id === key)!)})),
    getAllowedDropOperations: () => ['move'],
    acceptedDragTypes: [type],
    getDropOperation: () => 'move',
    onDragEnd: repairNextPress,
    renderDropIndicator: target => <DropIndicator target={target} className="rp-canvas-drop" />,
    onReorder: event => {
      for (const key of event.keys) onPlace(String(key), {target: String(event.target.key), after: event.target.dropPosition === 'after'});
    },
    onInsert: async event => {
      const id = await read(event);
      if (id) onPlace(id, {target: String(event.target.key), after: event.target.dropPosition === 'after'});
    },
    onRootDrop: async event => {
      const id = await read(event);
      if (id) onPlace(id, {});
    }
  });
  return (
    <GridList
      {...props}
      ref={ref}
      aria-label={label}
      layout="grid"
      className={profile ? 'rp-dash-section' : 'rp-sortable-grid'}
      data-profile={profile}
      items={items}
      dragAndDropHooks={dragAndDropHooks}
      dependencies={[children, tools]}
    >
      {item => (
        <GridListItem
          id={item.id}
          textValue={textValue(item)}
          className={cx('rp-dashboard-cell', !profile && 'rp-sortable-row rp-widget-tile')}
          {...(profile ? tileAttributes(item) : {'data-size': item.size})}
        >
          <div className="rp-dashboard-tools">
            <RButton slot="drag" className={buttonClass({quiet: true, icon: true, small: !profile})} aria-label={dragLabel(item)}>
              <DragHandle />
            </RButton>
            {tools?.(item)}
          </div>
          <div className="rp-dashboard-body" inert>
            {children(item)}
          </div>
        </GridListItem>
      )}
    </GridList>
  );
}
