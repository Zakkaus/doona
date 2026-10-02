import {expect, it, vi} from 'vitest';
import type {DragAndDropHooks} from 'react-aria-components';
import {guardDragStart} from './dragAndDrop';

it('ignores a press of the drag handle while a drag is under way', () => {
  let dragging = false;
  const start = vi.fn();
  const hooks = guardDragStart({
    isVirtualDragging: () => dragging,
    useDraggableItem: () => ({dragProps: {}, dragButtonProps: {onPress: start}})
  } as unknown as DragAndDropHooks);
  const press = () => hooks.useDraggableItem!({key: 'a'}, {} as never).dragButtonProps.onPress!({} as never);
  press();
  dragging = true;
  press();
  expect(start).toHaveBeenCalledTimes(1);
});
