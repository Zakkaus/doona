import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from 'react';
import {flushSync} from 'react-dom';
import {VisuallyHidden, useFocusVisible, useLocale, useMove} from 'react-aria';
import {
  anchorPanelOffset,
  defaultPanelWidth,
  edgePlacement,
  fitPanelOffset,
  minPanelSize,
  nearestEdge,
  resizePanel,
  type PanelEdge,
  type PanelBox,
  type PanelOffset,
  type PanelSize,
  type ScreenEdge
} from './panelSize';
import {escapeLayers} from './hooks';
import './styles/floating-panel.css';

// One arrow-key step of a panel handle, in CSS pixels.
export const resizeStep = 16;
type Delta = [dx: number, dy: number];
const arrows: Record<string, Delta> = {ArrowLeft: [-resizeStep, 0], ArrowRight: [resizeStep, 0], ArrowUp: [0, -resizeStep], ArrowDown: [0, resizeStep]};
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
export function ResizeHandle({edge, label, grip, ...props}: {edge: PanelEdge; label?: string; grip?: boolean} & ReturnType<typeof useGesture>['props']) {
  return (
    <button
      type="button"
      {...props}
      className={grip ? 'rp-panel-resize rp-grip' : 'rp-panel-resize'}
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

// How long a panel hidden at an edge stays out after the pointer and keyboard focus leave it, a tooltip's delay.
const hideDelay = 400;
type EdgeHide = {handle: ReactNode; label: string; keepOut: boolean};
type Placement = {edge: ScreenEdge; at: number; shift: {x: number; y: number}};
type Box = PanelBox & {right: number; bottom: number};
// Where the panel is laid out in its frame, without the translate that slides it to or from an edge.
function layoutBox(frame: HTMLElement | null, panel: HTMLElement | null): Box | null {
  if (!frame || !panel) return null;
  const at = frame.getBoundingClientRect();
  const [left, top, width, height] = [at.left + panel.offsetLeft, at.top + panel.offsetTop, panel.offsetWidth, panel.offsetHeight];
  return {left, top, width, height, right: left + width, bottom: top + height};
}
const within = (el: Element | null, {x, y}: {x: number; y: number}) => {
  const r = el?.getBoundingClientRect();
  return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
// The menus and popovers the panel opened: each trigger marks itself expanded with the overlay it controls.
const openTriggers = (panel: HTMLElement | null) => [...(panel?.querySelectorAll('[aria-expanded="true"][aria-controls]') ?? [])];
// Whether `target` is in the panel or in one of the overlays it opened.
const ownedBy = (panel: HTMLElement | null, target: Node | null) =>
  !!target &&
  (!!panel?.contains(target) ||
    openTriggers(panel).some(trigger => {
      const overlay = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
      return !!(overlay?.closest('[data-trigger]') ?? overlay)?.contains(target);
    }));
// Elements that take Escape themselves, so the panel leaves it to them: text fields, menus, lists, dialogs and popovers,
// and an open trigger.
const ownsEscape = `${escapeLayers}, input:not([type="radio"], [type="checkbox"]), textarea, [role="menu"], [role="listbox"], [aria-expanded="true"]`;
const describedByTooltip = (el: Element) =>
  !!el
    .getAttribute('aria-describedby')
    ?.split(' ')
    .some(id => document.getElementById(id)?.getAttribute('role') === 'tooltip');
// A panel hidden at an edge comes out while the pointer is over its handle or over the panel, while keyboard focus is in
// the panel, while a pointer drags or resizes it, while a menu or popover it opened is open, and while `keepOut`. A
// press on the handle, or the keyboard reaching it, holds it out until a press outside the panel and its overlays or
// focus moving away. It goes back `hideDelay` after all of them end, or at once on Escape, which returns focus to the
// handle. The handle, the panel's collapsed summary, shows only while the panel is hidden: reached by keyboard, it
// brings the panel out and moves focus into it. Its edge and the handle's place are measured from where the panel is
// laid out, once no gesture moves it; the pointer's last place is checked again after each measurement.
function useEdgeHide(edge: EdgeHide | undefined, settled: boolean, laidOut: string, box: () => Box | null, panel: RefObject<HTMLElement | null>) {
  const on = !!edge;
  const handle = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [held, setHeld] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [lingering, setLingering] = useState(false);
  // Focus counts while the reader moves it by keyboard, not where a pointer press left it.
  const {isFocusVisible} = useFocusVisible();
  const want = on && !dismissed && (hover || (focus && isFocusVisible) || held || menu || !settled || !!edge?.keepOut);
  const [wanted, setWanted] = useState(want);
  if (wanted !== want) {
    setWanted(want);
    setLingering(!want && !dismissed);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = setTimeout(() => setLingering(false), hideDelay);
    return () => clearTimeout(timer);
  }, [lingering]);
  const shown = want || (lingering && !dismissed);
  const [place, setPlace] = useState<Placement | null>(null);
  useEffect(() => {
    const el = panel.current;
    if (!on || !el) return;
    const check = () => setMenu(openTriggers(el).length > 0);
    const observer = new MutationObserver(check);
    observer.observe(el, {subtree: true, attributes: true, attributeFilter: ['aria-expanded']});
    check();
    return () => observer.disconnect();
  }, [on, panel]);
  // The pointer counts over the panel and over the handle's place, which stays measurable while the handle is hidden.
  // Its last place is kept, so a panel that changes under a still pointer is checked again.
  const pointer = useRef<{x: number; y: number} | null>(null);
  const inside = useRef(false);
  const recheck = useEffectEvent(() => {
    const at = pointer.current;
    const next = !!at && (within(panel.current, at) || within(handle.current, at));
    if (next && !inside.current) setDismissed(false);
    inside.current = next;
    setHover(next);
  });
  // Measured again whenever `laidOut` changes and whenever the panel's content resizes it.
  useLayoutEffect(() => {
    const [inner, tab] = [panel.current, handle.current];
    if (!on || !settled || !inner || !tab) return;
    const measure = () => {
      const at = box();
      if (!at) return;
      const view = {width: document.documentElement.clientWidth, height: document.documentElement.clientHeight};
      const side = nearestEdge(at, view);
      const next = {edge: side, ...edgePlacement(at, view, side, side === 'left' || side === 'right' ? tab.offsetHeight : tab.offsetWidth)};
      setPlace(last => (JSON.stringify(last) === JSON.stringify(next) ? last : next));
      recheck();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [on, settled, laidOut, box, panel]);
  // The handle moved to its new place.
  useLayoutEffect(() => recheck(), [place]);
  useEffect(() => {
    if (!on) return;
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.current = {x: event.clientX, y: event.clientY};
      recheck();
    };
    const away = () => {
      pointer.current = null;
      recheck();
    };
    addEventListener('pointermove', move);
    document.documentElement.addEventListener('pointerleave', away);
    return () => {
      removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', away);
    };
  }, [on]);
  // A press outside the panel, its handle and the menus and popovers it opened lets a held panel go.
  useEffect(() => {
    if (!held) return;
    const press = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!ownedBy(panel.current, target) && !handle.current?.contains(target)) setHeld(false);
    };
    addEventListener('pointerdown', press, true);
    return () => removeEventListener('pointerdown', press, true);
  }, [held, panel]);
  const pressedBy = useRef('');
  const escaping = useRef(false);
  if (!edge) return {handle: null, panelProps: {}, frameProps: {}};
  const hold = () => {
    setDismissed(false);
    setHeld(true);
  };
  // Brings the panel out for the keyboard and moves focus to its header, the panel's own keyboard handle.
  const reveal = () => {
    flushSync(hold);
    panel.current?.querySelector<HTMLElement>('.rp-panel-move')?.focus();
  };
  return {
    handle: (
      <button
        ref={handle}
        type="button"
        className="rp-edge-handle"
        data-edge={place?.edge}
        data-out={shown || undefined}
        aria-label={edge.label}
        style={place ? ({'--rp-edge-at': `${place.at}px`} as CSSProperties) : undefined}
        onFocus={event => !escaping.current && event.currentTarget.matches(':focus-visible') && reveal()}
        onPointerDown={event => (pressedBy.current = event.pointerType)}
        onClick={() => {
          // A tap opens the panel, which no hover shows on touch; a click or a key also moves focus into it.
          if (pressedBy.current === 'touch') hold();
          else reveal();
          pressedBy.current = '';
        }}
      >
        {edge.handle}
      </button>
    ),
    panelProps: {
      'data-edge': place?.edge,
      'data-tucked': shown || !place ? undefined : '',
      style: place && {'--rp-edge-shift': `${place.shift.x}px ${place.shift.y}px`}
    },
    frameProps: {
      onFocus: () => setFocus(true),
      onBlur: (event: FocusEvent) => {
        const to = event.relatedTarget as Node | null;
        if (event.currentTarget.contains(to) || ownedBy(panel.current, to)) return;
        setFocus(false);
        setDismissed(false);
        // Focus moved elsewhere; a press that only drops focus is the press handler's to judge.
        if (to) setHeld(false);
      },
      onKeyDown: (event: KeyboardEvent) => {
        const target = event.target as Element;
        if (event.key !== 'Escape' || !shown || edge.keepOut || target.closest(ownsEscape) || describedByTooltip(target)) return;
        flushSync(() => {
          setDismissed(true);
          setHeld(false);
          setHover(false);
        });
        escaping.current = true;
        handle.current?.focus();
        escaping.current = false;
      }
    }
  };
}
// The widget panel, in a frame between the top bar and the dock, at its bottom inline-end corner above the content until
// the reader moves it by its header, by pointer or by arrow keys on the header in steps of 16px. Every corner and edge
// resizes it by pointer with the opposite side fixed, up to its content's height, and the top inline-start corner also
// by arrow keys. The handles draw nothing but their cursor and, from the keyboard, a focus ring. A panel left in the
// frame's upper half keeps its top edge and one in the lower half its bottom edge, so expanding or resizing grows it
// towards the room; the frame keeps it inside the viewport. Dropping the header over `dockTarget` docks the panel
// instead of moving it. A collapsed panel is its header alone and keeps only its width, or the header's whole content
// where that is wider; expanding restores the stored height. A `locked` panel keeps its place and size: it renders no move or resize handles, so neither pointer nor
// keyboard moves it, while the frame still keeps it inside the viewport. With `edge` the panel hides at the screen edge
// nearest to it behind a handle, as useEdgeHide describes.
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
  locked = false,
  children,
  dockTarget,
  onDock,
  edge: edgeHide
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
  locked?: boolean;
  children?: ReactNode;
  dockTarget?: () => HTMLElement | null;
  onDock?: () => void;
  edge?: EdgeHide;
}) {
  const rtl = useLocale().direction === 'rtl';
  const frame = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [moved, setMoved] = useState(0);
  // The handles sit at the inline-start side, so moving towards it grows the panel or moves it away from home.
  const inward = (dx: number) => (rtl ? dx : -dx);
  const room = () =>
    frame.current?.getBoundingClientRect() ?? {width: innerWidth - 32, height: innerHeight, left: 0, right: innerWidth, top: 0, bottom: innerHeight};
  // Measured from the layout, so a gesture that starts while the panel slides to or from an edge starts where it rests.
  const laidOutBox = useCallback(() => layoutBox(frame.current, panel.current), []);
  const box = () => laidOutBox() ?? {width: size?.width ?? defaultPanelWidth, height: minPanelSize.height, left: 0, right: 0, top: 0, bottom: 0};
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
      return {size: {width: inner.width, height: inner.height}, offset: drawn(), tallest, moved: 0};
    },
    // `moved` is the gesture's vertical travel so far, which starts at zero with each gesture.
    (base, dx, dy) => {
      const moved = base.moved + Math.abs(dy);
      return {...resizePanel(base, edge.current, -inward(dx), dy, room(), base.tallest, moved), tallest: base.tallest, moved};
    },
    next => onResize(next.size, next.offset)
  );
  // Where the pointer is while the header drags, to tell a drop on the dock target from a move.
  const pointer = useRef<{x: number; y: number} | null>(null);
  const over = (target = dockTarget?.()) => !!pointer.current && within(target ?? null, pointer.current);
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
  const hiding = useEdgeHide(
    edgeHide,
    !move.live && !resize.live,
    edgeHide ? [offset?.x, offset?.y, offset?.top, size?.width, size?.height, collapsed, innerWidth, innerHeight].join() : '',
    laidOutBox,
    panel
  );
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
    (offset && fitPanelOffset(offset, {width: innerWidth - 32, height: innerHeight}, {width: size?.width ?? defaultPanelWidth, height: 0}));
  return (
    <div
      ref={frame}
      className="rp-floating-frame"
      data-anchor={shownOffset?.top ? 'top' : undefined}
      style={shownOffset && ({'--rp-panel-x': `${shownOffset.x}px`, '--rp-panel-y': `${shownOffset.y}px`} as CSSProperties)}
      {...hiding.frameProps}
    >
      {hiding.handle}
      <section
        ref={panel}
        className="rp-floating-panel"
        aria-label={label}
        data-collapsed={collapsed || undefined}
        {...hiding.panelProps}
        style={
          {
            ...hiding.panelProps.style,
            '--rp-panel-width': `${shownSize?.width ?? defaultPanelWidth}px`,
            ...(shownSize && !collapsed && {'--rp-panel-height': `${shownSize.height}px`})
          } as CSSProperties
        }
      >
        {!collapsed &&
          !locked &&
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
        <div className="rp-panel-head" onPointerDown={locked ? undefined : onPointerDown}>
          {!locked && <button type="button" {...move.props} onPointerDown={onPointerDown} className="rp-panel-move" aria-label={moveLabel} />}
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
