import {useEffect, useLayoutEffect, useRef, type PointerEvent} from 'react';
import {useFocusRing, useMove} from 'react-aria';

// One of a card's sizes: a width carries its fraction of the section.
export type ResizeOption = {value: string; label: string; fraction?: number};
export type ResizeAxis = {label: string; value: string; options: ResizeOption[]; onChange: (option: ResizeOption) => void};

// A dashboard card's edge handles in edit mode: the inline-end edge sets the width, the bottom edge the height step.
// A drag snaps to the nearest step and applies it at once, so the card and its neighbours reflow under the pointer;
// a focused handle steps with the arrow keys, mirrored for right-to-left. Phones have no width handle: their columns
// follow the profile.
export function DashboardResize({width, height}: {width: ResizeAxis; height?: ResizeAxis}) {
  return (
    <>
      <Handle axis={width} edge="width" />
      {height && <Handle axis={height} edge="height" />}
    </>
  );
}

// The geometry of a width step: a fraction of the section's visible width and one gap less, snapped to sixths below
// the twelve-column width (see dashboard.css). Auto, which has no fraction, is the box the section's profile gives the
// card: its own width while it is Auto, else its --rp-span tracks of 420 less its --rp-shift and --rp-trim gap shares.
const ratio = (value: string) => {
  const [a, b = 1] = value.split('/').map(Number);
  return a / b || 0;
};
function widthsOf(cell: HTMLElement, options: ResizeOption[]) {
  const section = cell.closest<HTMLElement>('.rp-dash-section')!;
  const style = getComputedStyle(section);
  const own = getComputedStyle(cell);
  const snap = Number.parseFloat(style.getPropertyValue('--rp-dash-snap')) || 12;
  const gap = Number.parseFloat(style.getPropertyValue('--rp-dash-gap')) || 0;
  const visible = section.getBoundingClientRect().width + Math.min(0, Number.parseFloat(style.marginInlineStart) || 0);
  const span = Number.parseFloat(own.getPropertyValue('--rp-span')) || 420;
  const shares = ratio(own.getPropertyValue('--rp-shift')) - ratio(own.getPropertyValue('--rp-trim'));
  return options.map(option => {
    if (option.fraction === undefined) return cell.dataset.width ? (span / 420) * (visible + gap) - gap + shares * gap : cell.getBoundingClientRect().width;
    const share = snap >= 12 ? option.fraction : Math.ceil(option.fraction * snap - 1e-6) / snap;
    return share * (visible + gap) - gap;
  });
}
// The step whose width is nearest `target`; a fraction wins a tie with Auto, so every fraction stays reachable.
const nearest = (options: ResizeOption[], sizes: number[], target: number) =>
  sizes.reduce((best, size, at) => {
    const d = Math.abs(size - target) - Math.abs(sizes[best] - target);
    return d < -0.5 || (d <= 0.5 && options[best].fraction === undefined && options[at].fraction !== undefined) ? at : best;
  }, 0);

// One keydown listener serves every handle on the page. The card's grid row takes arrow keys before its children
// do, so it listens ahead of the row, at the window in the capture phase, and hands a key to the focused handle.
const handlers = new Map<EventTarget, (event: KeyboardEvent) => void>();
const onKey = (event: KeyboardEvent) => event.target && handlers.get(event.target)?.(event);
function listen(node: HTMLElement, handler: (event: KeyboardEvent) => void) {
  if (!handlers.size) addEventListener('keydown', onKey, true);
  handlers.set(node, handler);
  return () => {
    handlers.delete(node);
    if (!handlers.size) removeEventListener('keydown', onKey, true);
  };
}

// A handle is a slider over the axis's steps in their order, Auto first for a width. Its value text names the step.
function Handle({axis, edge}: {axis: ResizeAxis; edge: 'width' | 'height'}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{start: number; size: number; travel: number; sizes: number[]; step: number; index: number} | null>(null);
  const {focusProps, isFocusVisible} = useFocusRing();
  const cell = () => ref.current!.closest<HTMLElement>('.rp-dashboard-cell')!;
  const rtl = () => getComputedStyle(ref.current!).direction === 'rtl';
  const current = Math.max(
    0,
    axis.options.findIndex(option => option.value === axis.value)
  );
  // The next step from the current one. From Auto, which has no fraction, forward is the first width past the card's
  // own, and back stays on Auto, the first step.
  const next = (forward: boolean) => {
    if (edge === 'width' && axis.options[current].fraction === undefined) {
      if (!forward) return current;
      const width = cell().getBoundingClientRect().width;
      const sizes = widthsOf(cell(), axis.options);
      const index = sizes.findIndex((size, at) => axis.options[at].fraction !== undefined && size > width + 1);
      return index < 0 ? axis.options.length - 1 : index;
    }
    return Math.max(0, Math.min(axis.options.length - 1, current + (forward ? 1 : -1)));
  };
  const choose = (index: number) => {
    if (drag.current) drag.current.index = index;
    if (axis.options[index].value !== axis.value) axis.onChange(axis.options[index]);
  };
  const {moveProps} = useMove({
    onMoveStart: () => {
      const box = cell().getBoundingClientRect();
      // A height step has no size to aim at before it renders, so the pointer moves one step per --rp-space-16.
      const step = Number.parseFloat(getComputedStyle(cell()).getPropertyValue('--rp-space-16')) || 1;
      const sizes = edge === 'width' ? widthsOf(cell(), axis.options) : [];
      drag.current = {start: current, size: edge === 'width' ? box.width : box.height, travel: 0, sizes, step, index: current};
      cell().dataset.resizing = '';
    },
    onMove: ({deltaX, deltaY, pointerType}) => {
      const d = drag.current;
      if (!d || pointerType === 'keyboard') return;
      d.travel += edge === 'width' ? deltaX * (rtl() ? -1 : 1) : deltaY;
      const index =
        edge === 'width'
          ? nearest(axis.options, d.sizes, d.size + d.travel)
          : Math.max(0, Math.min(axis.options.length - 1, d.start + Math.round(d.travel / d.step)));
      if (index !== d.index) choose(index);
    },
    onMoveEnd: () => {
      drag.current = null;
      delete cell().dataset.resizing;
    }
  });
  const keys = useRef((_: KeyboardEvent) => {});
  useLayoutEffect(() => {
    keys.current = event => {
      const forward = edge === 'width' ? (rtl() ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
      const back = edge === 'width' ? (rtl() ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
      if (event.key !== forward && event.key !== back) return;
      event.preventDefault();
      event.stopPropagation();
      choose(next(event.key === forward));
    };
  });
  useEffect(() => listen(ref.current!, event => keys.current(event)), []);
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      {...focusProps}
      {...moveProps}
      // The card's row is draggable; a press here starts a resize, never a move or a selection.
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        moveProps.onPointerDown?.(event);
      }}
      className="rp-dashboard-resize rp-grip"
      data-edge={edge}
      data-focus-visible={isFocusVisible || undefined}
      aria-label={axis.label}
      aria-orientation={edge === 'width' ? 'horizontal' : 'vertical'}
      aria-valuemin={0}
      aria-valuemax={axis.options.length - 1}
      aria-valuenow={current}
      aria-valuetext={axis.options[current]?.label}
    />
  );
}
