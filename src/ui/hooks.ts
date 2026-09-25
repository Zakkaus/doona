import {type RefObject, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';

export function withCrossfade(fn: () => void) {
  const d = document as Document & {startViewTransition?: (cb: () => void) => void};
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  d.startViewTransition(() => flushSync(fn));
}

export function useSlider(value: string, selector = '[data-selected]') {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{x: number; y: number; w: number; h: number; still: boolean} | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The marker slides only when the selection changes. A resize, or a hidden panel shown again, puts it in place
    // without motion; while hidden (a kept tab panel) nothing is measured, so it does not collapse to the start.
    const measure = (still: boolean) => {
      if (!el.offsetWidth) return;
      const sel = el.querySelector<HTMLElement>(selector);
      if (!sel) return setPos(null);
      const next = {x: sel.offsetLeft, y: sel.offsetTop, w: sel.offsetWidth, h: sel.offsetHeight, still};
      setPos(prev => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure(false);
    const ro = new ResizeObserver(() => measure(true));
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, selector]);
  return [ref, pos] as const;
}

// Whether an element's content is wider than the element, tracked through resizes of it and of its children (a label
// that changes, a web font that arrives). `key` names the children, so new ones are observed. A resize commits before
// the browser paints, so no frame shows the content spilling out.
export function useOverflow(ref: RefObject<HTMLElement | null>, key: string) {
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOver(el.scrollWidth > el.clientWidth);
    measure();
    const ro = new ResizeObserver(() => flushSync(measure));
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  }, [ref, key]);
  return over;
}

// The content width of an element, tracked through resizes; null until measured.
export function useContentWidth<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured before the first paint, so a table never shows its minimum widths for one frame.
    setWidth(Math.floor(el.clientWidth));
    const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
// Fill the remaining viewport without shrinking below min.
export function useFillHeight<E extends HTMLElement>(min: number, gap = 24) {
  const ref = useRef<E>(null);
  const [height, setHeight] = useState(min);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = Math.max(min, Math.floor(window.innerHeight - el.getBoundingClientRect().top - gap));
      setHeight(previous => (previous === next ? previous : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [min, gap]);
  return [ref, height] as const;
}

// Whether shortcuts should read as ⌘ rather than Ctrl; userAgentData is the standard, platform the fallback.
export const isMac =
  (navigator as Navigator & {userAgentData?: {platform: string}}).userAgentData?.platform === 'macOS' || navigator.platform.startsWith('Mac');

// Below this breakpoint, detail drawers must not follow keyboard focus.
export const panelQuery = '(min-width: 1200px)';

// Reset linked drafts during render so navigation cannot paint the previous value.
export function useLinked<T>(linked: T, apply: (value: T) => void) {
  const [last, setLast] = useState(linked);
  if (last !== linked) {
    setLast(linked);
    apply(linked);
  }
}

// The value as it stood once `ms` passed without a change; a text filter that costs a request waits on it.
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const on = () => setMatches(list.matches);
    on();
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [query]);
  return matches;
}
