import {useContext, useEffect, useRef, useState, type ReactNode, type RefObject} from 'react';
import {Tooltip, TooltipTrigger, TooltipTriggerStateContext, OverlayArrow, Focusable} from 'react-aria-components';
import {cx} from './cx';

export function Tip({children, triggerRef}: {children: ReactNode; triggerRef?: RefObject<HTMLElement | null>}) {
  return (
    <Tooltip className="rp-tip" offset={6} triggerRef={triggerRef}>
      <OverlayArrow /> {children}
    </Tooltip>
  );
}

// Every mounted TextTooltip measures in one pass per frame, after paint, through one shared observer: a table
// mounts hundreds of them, and one layout read each in its own layout effect held the first paint of a page.
const measures = new WeakMap<Element, () => void>();
const queue = new Set<() => void>();
let frame = 0;
function enqueue(measure: () => void) {
  queue.add(measure);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const batch = [...queue];
    queue.clear();
    for (const fn of batch) fn();
  });
}
const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => entries.forEach(entry => measures.get(entry.target)?.()));
// Keyboard focus on one of these opens the first nested tooltip, which cannot take focus itself; a row is left
// out, since it holds many cells and its name already carries their full text.
const REVEALS = 'button, a, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]';
const STOPS = REVEALS + ', [role="row"]';

// Opens the tip where hover cannot: on keyboard focus of the stop around the text, and on a tap. It goes through the
// trigger's own state, so an open also cancels a close the trigger scheduled when the pointer left.
function Reveals({target, nested}: {target: RefObject<HTMLSpanElement | null>; nested: boolean}) {
  const state = useContext(TooltipTriggerStateContext)!;
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    const el = target.current;
    const stop = nested ? el?.closest<HTMLElement>(REVEALS) : null;
    if (!el || !stop) return;
    const show = () => {
      if (stop.matches(':focus-visible') && stop.querySelector('[data-tip]') === el) latest.current.open(true);
    };
    const hide = () => latest.current.close(true);
    stop.addEventListener('focus', show);
    stop.addEventListener('blur', hide);
    // The text can turn truncated, or the listeners arrive, after the stop took focus.
    if (document.activeElement === stop) show();
    return () => {
      stop.removeEventListener('focus', show);
      stop.removeEventListener('blur', hide);
    };
  }, [target, nested]);
  // A finger has no hover and a tap is not :focus-visible, so on a coarse pointer a tap on the cut text shows it whole,
  // unless the text sits in something the tap presses (a button, a link) or in a table whose row press opens a detail
  // showing the value in full: that press wins. A row press that does something else still happens beside the tip.
  // The tip then stays until a press elsewhere, Escape or a scroll.
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const tap = () => {
      if (!matchMedia('(pointer: coarse)').matches || el.closest(REVEALS) || el.closest('[data-row-detail]')) return;
      setTapped(true);
      latest.current.open(true);
    };
    el.addEventListener('click', tap);
    return () => el.removeEventListener('click', tap);
  }, [target]);
  useEffect(() => {
    if (!tapped) return;
    const close = () => {
      setTapped(false);
      latest.current.close(true);
    };
    const away = (e: PointerEvent) => {
      if (!target.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [tapped, target]);
  return null;
}

// `cut="start"` drops the start of a value whose end matters more, as a host name's registrable domain.
export function TextTooltip({
  children,
  text,
  tooltipText,
  className,
  cut
}: {
  children: ReactNode;
  text?: string;
  tooltipText?: string;
  className?: string;
  cut?: 'start';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  // Not a tab stop until measured: a focusable span inside a row would swallow the row's own press.
  const [nested, setNested] = useState(true);
  const active = overflow || !!text;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (text) {
      setNested(!!el.closest(STOPS));
      return;
    }
    const measure = () => {
      setOverflow(el.scrollWidth > el.clientWidth);
      // Nested tab stops swallow their ancestor's press; grid navigation still focuses cell text.
      setNested(!!el.closest(STOPS));
    };
    measures.set(el, measure);
    resized?.observe(el);
    return () => {
      resized?.unobserve(el);
      measures.delete(el);
      queue.delete(measure);
    };
    // The span remounts when the trigger wraps it, so the observer follows `active` too.
  }, [text, active]);
  // New content can overflow without resizing the box, so it is measured again; the observer stays attached.
  useEffect(() => {
    const measure = ref.current && measures.get(ref.current);
    if (measure) enqueue(measure);
  }, [children, text, active]);
  const span = (
    <span
      ref={ref}
      className={cx('rp-truncate', cut === 'start' && 'rp-truncate-start', className)}
      tabIndex={active && !nested ? 0 : -1}
      data-tip={active ? '' : undefined}
    >
      {cut === 'start' ? <bdi>{children}</bdi> : children}
    </span>
  );
  // A table mounts hundreds of these; the trigger and its focusable wrapper exist only once text overflows.
  if (!active) return span;
  return (
    <TooltipTrigger delay={400}>
      <Focusable>{span}</Focusable>
      <Reveals target={ref} nested={nested} />
      <Tip>{text ?? tooltipText ?? children}</Tip>
    </TooltipTrigger>
  );
}
