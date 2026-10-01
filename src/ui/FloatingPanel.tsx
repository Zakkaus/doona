import {useEffect, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode} from 'react';
import {VisuallyHidden, useLocale, useMove} from 'react-aria';
import {anchorPanelOffset, fitPanelOffset, minPanelSize, resizePanel, type PanelEdge, type PanelOffset, type PanelSize} from './panelSize';
import './styles/floating-panel.css';

const step = 16;
// The panel's width before the reader sizes it is the narrowest the resize allows.
const defaultWidth = minPanelSize.width;
type Delta = [dx: number, dy: number];
const arrows: Record<string, Delta> = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};
// Four corners and four edges; the first, the corner away from home, is the one keyboard stop.
const edges: PanelEdge[] = [
  {inline: 'start', block: 'start'},
  {inline: 'end', block: 'start'},
  {inline: 'start', block: 'end'},
  {inline: 'end', block: 'end'},
  {block: 'start'},
  {block: 'end'},
  {inline: 'start'},
  {inline: 'end'}
];

// A pointer or keyboard gesture on a bare handle: the value it changes is live while a pointer drags and reported when
// the gesture ends; an arrow key reports at once. While a pointer drags, nothing on the page is selected.
export function useGesture<T>(start: () => T, apply: (base: T, dx: number, dy: number) => T, report: (value: T) => void) {
  const [live, setLiveState] = useState<T | null>(null);
  const latest = useRef<T | null>(null);
  const setLive = (next: T | null) => {
    latest.current = next;
    setLiveState(next);
    document.documentElement.toggleAttribute('data-panel-gesture', next !== null);
  };
  useEffect(() => () => document.documentElement.removeAttribute('data-panel-gesture'), []);
  const {moveProps} = useMove({
    onMoveStart: () => setLive(start()),
    // The handle's own onKeyDown replaces useMove's, so every move here comes from a pointer.
    onMove: ({deltaX, deltaY}) => {
      if (latest.current) setLive(apply(latest.current, deltaX, deltaY));
    },
    onMoveEnd: () => {
      if (!latest.current) return;
      report(latest.current);
      setLive(null);
    }
  });
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const delta = arrows[event.key];
    if (!delta) return;
    event.preventDefault();
    report(apply(start(), ...delta));
  };
  return {live, props: {...moveProps, onKeyDown}};
}

// A bare resize hit area on a side or corner of `edge`: it draws only its cursor and, from the keyboard, a focus ring.
// Unnamed, it is a pointer-only duplicate of a named one.
export function ResizeHandle({edge, label, ...props}: {edge: PanelEdge; label?: string} & ReturnType<typeof useGesture>['props']) {
  return (
    <button
      type="button"
      {...props}
      className="rp-panel-resize"
      data-inline={edge.inline}
      data-block={edge.block}
      {...(label ? {'aria-label': label} : {tabIndex: -1, 'aria-hidden': true})}
    />
  );
}

// Renders again when the window resizes, so the drawn offset follows the viewport.
function useViewportSize() {
  const [, update] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    addEventListener('resize', update);
    return () => removeEventListener('resize', update);
  }, []);
}

// The widget panel, in a frame between the top bar and the dock, at its bottom inline-end corner above the content until
// the reader moves it by its header, by pointer or by arrow keys on the header in steps of 16px. Every corner and edge
// resizes it by pointer with the opposite side fixed, up to its content's height, and the top inline-start corner also
// by arrow keys. The handles draw nothing but their cursor and, from the keyboard, a focus ring. A panel left in the
// frame's upper half keeps its top edge and one in the lower half its bottom edge, so expanding or resizing grows it
// towards the room; the frame keeps it inside the viewport. Dropping the header over `dockTarget` docks the panel
// instead of moving it. A collapsed panel is its header alone and keeps only its width; expanding restores the stored
// height.
export function FloatingPanel({
  label,
  resizeLabel,
  moveLabel,
  movedText,
  size,
  offset,
  onResize,
  onMove,
  header,
  collapsed = false,
  children,
  dockTarget,
  onDock
}: {
  label: string;
  resizeLabel: string;
  moveLabel: string;
  movedText: string;
  size?: PanelSize;
  offset?: PanelOffset;
  onResize: (size: PanelSize, offset: PanelOffset) => void;
  onMove: (offset: PanelOffset) => void;
  header: ReactNode;
  collapsed?: boolean;
  children?: ReactNode;
  dockTarget?: () => HTMLElement | null;
  onDock?: () => void;
}) {
  const rtl = useLocale().direction === 'rtl';
  const frame = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [moved, setMoved] = useState(0);
  // The handles sit at the inline-start side, so moving towards it grows the panel or moves it away from home.
  const inward = (dx: number) => (rtl ? dx : -dx);
  const room = () =>
    frame.current?.getBoundingClientRect() ?? {width: innerWidth - 32, height: innerHeight, left: 0, right: innerWidth, top: 0, bottom: innerHeight};
  const box = () =>
    panel.current?.getBoundingClientRect() ?? {width: size?.width ?? defaultWidth, height: minPanelSize.height, left: 0, right: 0, top: 0, bottom: 0};
  // The offset as drawn, measured from the edge the panel keeps: a stored offset beyond a smaller window neither hides
  // the panel nor lags the pointer.
  const drawn = (): PanelOffset => {
    const [outer, inner] = [room(), box()];
    const x = rtl ? inner.left - outer.left : outer.right - inner.right;
    return offset?.top ? {x, y: inner.top - outer.top, top: true} : {x, y: outer.bottom - inner.bottom};
  };
  const edge = useRef(edges[0]);
  const resize = useGesture(
    () => {
      const inner = box();
      const body = panel.current?.querySelector('.rp-widget-body');
      // The content's whole height: the panel's own plus what its list scrolls.
      const tallest = inner.height + (body ? body.scrollHeight - body.clientHeight : 0);
      return {size: {width: inner.width, height: inner.height}, offset: drawn(), tallest};
    },
    (base, dx, dy) => ({...resizePanel(base, edge.current, -inward(dx), dy, room(), base.tallest), tallest: base.tallest}),
    next => onResize(next.size, next.offset)
  );
  // Where the pointer is while the header drags, to tell a drop on the dock target from a move.
  const pointer = useRef<{x: number; y: number} | null>(null);
  const over = (target = dockTarget?.()) => {
    const at = pointer.current;
    const rect = target?.getBoundingClientRect();
    return !!(at && rect && at.x >= rect.left && at.x <= rect.right && at.y >= rect.top && at.y <= rect.bottom);
  };
  const move = useGesture(
    drawn,
    (base, dx, dy) => {
      if (pointer.current) pointer.current = {x: pointer.current.x + dx, y: pointer.current.y + dy};
      const target = dockTarget?.();
      // A pointer drag opens the target as soon as it starts; it highlights while the pointer is over it.
      target?.toggleAttribute('data-dock-armed', !!pointer.current);
      const docking = over(target);
      target?.toggleAttribute('data-dock-target', docking);
      panel.current?.toggleAttribute('data-docking', docking);
      const next = {...base, x: base.x + inward(dx), y: base.top ? base.y + dy : base.y - dy};
      return fitPanelOffset(next, room(), box());
    },
    next => {
      const target = dockTarget?.();
      // Read before the target closes, as closing shrinks it.
      const docking = over(target);
      target?.removeAttribute('data-dock-armed');
      target?.removeAttribute('data-dock-target');
      panel.current?.removeAttribute('data-docking');
      pointer.current = null;
      if (docking && onDock) return onDock();
      onMove(anchorPanelOffset(next, room().height, box().height));
      setMoved(serial => serial + 1);
    }
  );
  useViewportSize();
  // Presses on the header's own controls stay theirs; the rest of the header drags the panel.
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest('button:not(.rp-panel-move), a, input, [role="button"]')) return;
    pointer.current = {x: event.clientX, y: event.clientY};
    move.props.onPointerDown?.(event);
  };
  const shownSize = resize.live?.size ?? size;
  // A stored offset keeps the panel's width inside the frame; the frame's own layout keeps its height inside.
  const shownOffset =
    resize.live?.offset ??
    move.live ??
    (offset && fitPanelOffset(offset, {width: innerWidth - 32, height: innerHeight}, {width: size?.width ?? defaultWidth, height: 0}));
  return (
    <div
      ref={frame}
      className="rp-floating-frame"
      data-anchor={shownOffset?.top ? 'top' : undefined}
      style={shownOffset && ({'--rp-panel-x': `${shownOffset.x}px`, '--rp-panel-y': `${shownOffset.y}px`} as CSSProperties)}
    >
      <section
        ref={panel}
        className="rp-floating-panel"
        aria-label={label}
        style={
          {
            '--rp-panel-width': `${shownSize?.width ?? defaultWidth}px`,
            ...(shownSize && !collapsed && {'--rp-panel-height': `${shownSize.height}px`})
          } as CSSProperties
        }
      >
        {!collapsed &&
          edges.map((side, index) => (
            <ResizeHandle
              key={index}
              edge={side}
              label={index ? undefined : resizeLabel}
              {...resize.props}
              onPointerDown={event => {
                edge.current = side;
                resize.props.onPointerDown?.(event);
              }}
              onKeyDown={event => {
                edge.current = side;
                resize.props.onKeyDown(event);
              }}
            />
          ))}
        <div className="rp-panel-head" onPointerDown={onPointerDown}>
          <button type="button" {...move.props} onPointerDown={onPointerDown} className="rp-panel-move" aria-label={moveLabel} />
          {header}
        </div>
        {children}
        <VisuallyHidden>
          <span role="status">{moved > 0 && <span key={moved}>{movedText}</span>}</span>
        </VisuallyHidden>
      </section>
    </div>
  );
}
