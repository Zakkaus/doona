export type PanelSize = {width: number; height: number};
// Where the panel sits in its frame (the room between the top bar and the dock): x from the inline end, y from the
// frame's bottom, or from its top when `top` is set. A panel in the upper half keeps its top edge, so expanding or
// resizing it grows downwards, where the room is; one in the lower half keeps its bottom edge and grows upwards.
export type PanelOffset = {x: number; y: number; top?: true};
const limits = {width: [280, 640], height: [200, 960], offset: [0, 8192]} as const;
const clamp = (value: number, [min, max]: readonly [number, number]) => Math.round(Math.min(max, Math.max(min, value)));
// A stored panel size within its limits. The viewport bound is CSS's, so a smaller window shrinks the panel without
// rewriting the reader's size, and a larger one restores it.
export const clampPanelSize = (size: PanelSize): PanelSize => ({width: clamp(size.width, limits.width), height: clamp(size.height, limits.height)});
// A stored offset is only kept non-negative; the frame keeps the panel inside the viewport, so a window that grows back
// returns the panel to where the reader left it.
export const clampPanelOffset = ({x, y, top}: PanelOffset): PanelOffset => ({x: clamp(x, limits.offset), y: clamp(y, limits.offset), ...(top && {top})});
// The offset as drawn in a frame of `room`: the panel stays inside it, so a stored offset beyond a smaller window
// neither hides the panel nor lags the pointer.
export const fitPanelOffset = ({x, y, top}: PanelOffset, room: PanelSize, panel: PanelSize): PanelOffset => ({
  x: Math.max(0, Math.min(x, room.width - Math.min(panel.width, room.width))),
  y: Math.max(0, Math.min(y, room.height - Math.min(panel.height, room.height))),
  ...(top && {top})
});
// The same place measured from the edge nearer the panel's centre, so the panel grows towards the room it has.
export function anchorPanelOffset({x, y, top}: PanelOffset, room: number, height: number): PanelOffset {
  const above = top ? y : room - height - y;
  return above + height / 2 < room / 2 ? {x, y: Math.max(0, Math.round(above)), top: true} : {x, y: Math.max(0, Math.round(room - height - above))};
}
export const minPanelSize: PanelSize = {width: limits.width[0], height: limits.height[0]};
// A resize handle's edge: the side or corner it moves, in logical directions. The opposite side stays where it is.
export type PanelEdge = {inline?: 'start' | 'end'; block?: 'start' | 'end'};
// One resize step from a handle: `toEnd` is the pointer's movement towards the inline end, `down` its movement down.
// The offset is measured from the inline end and from the anchored block edge, so a handle on those sides moves the
// offset with it, and the offset never goes below zero. The panel stays inside `room`, the frame fitPanelOffset keeps a
// moved panel in, so no handle pushes a side out of the viewport, and grows no taller than its content (`tallest`).
export function resizePanel(
  base: {size: PanelSize; offset: PanelOffset},
  edge: PanelEdge,
  toEnd: number,
  down: number,
  room?: PanelSize,
  tallest: number = limits.height[1]
) {
  const axis = (
    side: 'start' | 'end' | undefined,
    home: 'start' | 'end',
    length: number,
    at: number,
    delta: number,
    range: readonly [number, number],
    bound: number
  ) => {
    if (!side) return [length, at];
    const next = clamp(length + (side === 'end' ? delta : -delta), range);
    if (side !== home) return [Math.max(Math.min(length, range[0]), Math.min(next, bound - at)), at];
    const fitted = Math.min(next, length + at);
    return [fitted, at - (fitted - length)];
  };
  const [width, x] = axis(edge.inline, 'end', base.size.width, base.offset.x, toEnd, limits.width, room?.width ?? Infinity);
  const [height, y] = axis(
    edge.block,
    base.offset.top ? 'start' : 'end',
    base.size.height,
    base.offset.y,
    down,
    [limits.height[0], Math.max(limits.height[0], Math.min(limits.height[1], tallest))],
    room?.height ?? Infinity
  );
  return {size: {width, height}, offset: {x, y, ...(base.offset.top && {top: base.offset.top})}};
}
