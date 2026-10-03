import {useEffect, useRef, type ReactNode} from 'react';
import {Button as RButton, DropIndicator, GridList, GridListItem, type DragAndDropOptions, type GridListProps} from 'react-aria-components';
import {useDragAndDrop} from './dragAndDrop';
import {buttonClass} from './Button';
import {cellSize} from './WidgetGrid';
import {sectionGrid, tileAttributes, usePacking, type TileProps} from './DashboardTile';
import DragHandle from './icons/DragHandle';
import {DashboardGaps, dragStarted} from './DashboardGaps';
import './styles/dashboard.css';
import './styles/sortable.css';

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

// Panel tools use the caption's end; dashboard tools have a reserved row above the live content.
export function SortableCanvas<T extends TileProps>({
  label,
  profile,
  items,
  textValue,
  dragLabel,
  tools,
  resize,
  gapLabel,
  refusal,
  rearm,
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
  resize?: (item: T) => ReactNode;
  gapLabel?: (share: string) => string;
  refusal?: string;
  rearm?: {focus?: string} | null;
  children: (item: T) => ReactNode;
  onPlace: (id: string, place: CanvasPlace) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePacking(profile ? ref : unpacked);
  // After a removal the canvas hides its card tools (data-rearm) until its owner clears it, and focus moves to the card
  // that took the removed one's place, unless focus is already somewhere.
  useEffect(() => {
    if (!rearm?.focus || (document.activeElement && document.activeElement !== document.body)) return;
    ref.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(rearm.focus)}"]`)?.focus();
  }, [rearm]);
  const read = async (event: {items: Parameters<NonNullable<DragAndDropOptions['onRootDrop']>>[0]['items']}) => {
    for (const item of event.items) if (item.kind === 'text' && item.types.has(type)) return item.getText(type);
  };
  const {dragAndDropHooks} = useDragAndDrop({
    getItems: keys => [...keys].map(key => ({[type]: String(key), 'text/plain': textValue(items.find(item => item.id === key)!)})),
    getAllowedDropOperations: () => ['move'],
    acceptedDragTypes: [type],
    getDropOperation: () => 'move',
    onDragStart: event => dragStarted(String([...event.keys][0])),
    onDragEnd: () => {
      dragStarted(undefined);
      repairNextPress();
    },
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
  const grid = (
    <GridList
      {...props}
      ref={ref}
      aria-label={label}
      layout="grid"
      className={profile ? 'rp-dash-section' : 'rp-widget-grid rp-sortable-grid'}
      data-profile={profile}
      data-grid={profile ? sectionGrid(items) : undefined}
      items={items}
      dragAndDropHooks={dragAndDropHooks}
      dependencies={[children, tools, resize]}
    >
      {item => (
        <GridListItem
          id={item.id}
          textValue={textValue(item)}
          className={profile ? 'rp-dashboard-cell' : 'rp-widget-cell rp-sortable-row'}
          {...(profile ? tileAttributes(item) : {'data-size': cellSize(item.size), 'data-module': item.module})}
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
          {resize?.(item)}
        </GridListItem>
      )}
    </GridList>
  );
  // A dashboard section's row hints are an overlay beside its grid, in a frame of the section's visible box.
  return profile ? (
    <div className="rp-dashboard-canvas" data-rearm={rearm ? '' : undefined}>
      {grid}
      {gapLabel && <DashboardGaps section={ref} label={gapLabel} refusal={refusal} onPlace={onPlace} />}
    </div>
  ) : (
    grid
  );
}
