import {useMemo} from 'react';
import {useDragAndDrop as useAriaDragAndDrop, type DragAndDropHooks, type DragAndDropOptions} from 'react-aria-components';

// React Aria begins a keyboard or screen reader drag when the handle is pressed but listens for the drag's keys only
// from the next frame. A second press in between (Enter pressed twice quickly, or a slow frame in WebKit) reached the
// handle again and began another drag, which throws "Cannot begin dragging while already dragging". The handle ignores
// presses while a drag is under way.
export function guardDragStart<T = object>(hooks: DragAndDropHooks<T>): DragAndDropHooks<T> {
  const {useDraggableItem, isVirtualDragging} = hooks;
  if (!useDraggableItem || !isVirtualDragging) return hooks;
  return {
    ...hooks,
    useDraggableItem: (props, state) => {
      const item = useDraggableItem(props, state);
      const press = item.dragButtonProps.onPress;
      const onPress: typeof press = event => {
        if (!isVirtualDragging()) press?.(event);
      };
      return {...item, dragButtonProps: {...item.dragButtonProps, onPress}};
    }
  };
}

export function useDragAndDrop<T = object>(options: DragAndDropOptions<T>) {
  const {dragAndDropHooks} = useAriaDragAndDrop(options);
  return {dragAndDropHooks: useMemo(() => guardDragStart(dragAndDropHooks), [dragAndDropHooks])};
}
