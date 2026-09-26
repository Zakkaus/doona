import {type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
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

// A strip of items that scrolls within itself when it is wider than its box, as a tab bar on a phone. The selected
// item is scrolled into view within the strip, never scrolling the page, when the selection changes and when the
// strip resizes. `data-fade` names the ends with more to scroll to, `start` and `end`, for the CSS to fade them; it is
// set on the element directly, so scrolling does not re-render the strip's owner.
export function useScrollStrip(ref: RefObject<HTMLElement | null>, value: string, selector = '[data-selected]') {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fade = () => {
      // scrollLeft runs negative in a right-to-left strip, so its magnitude is the distance from the start.
      const from = Math.abs(el.scrollLeft);
      const ends = [from > 1 && 'start', from < el.scrollWidth - el.clientWidth - 1 && 'end'].filter(Boolean).join(' ');
      if (ends) el.dataset.fade = ends;
      else delete el.dataset.fade;
    };
    const reveal = () => {
      const sel = el.querySelector<HTMLElement>(selector);
      if (!sel || !el.offsetWidth || el.scrollWidth <= el.clientWidth) return;
      // Clear of the faded edge where the strip has room for it.
      const box = el.getBoundingClientRect();
      const item = sel.getBoundingClientRect();
      const margin = Math.max(0, Math.min(24, (box.width - item.width) / 2));
      const before = item.left - (box.left + margin);
      const after = item.right - (box.right - margin);
      if (before < 0) el.scrollLeft += before;
      else if (after > 0) el.scrollLeft += Math.min(after, before);
    };
    const measure = () => {
      reveal();
      fade();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    el.addEventListener('scroll', fade, {passive: true});
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', fade);
    };
  }, [ref, value, selector]);
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

// Content dimensions shared by responsive SVG charts; activity charts round and throttle resize updates.
export function useContentSize<E extends HTMLElement>(round = Math.floor, interval = 0) {
  const ref = useRef<E>(null);
  const [size, setSize] = useState<{width: number; height: number} | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = {width: 0, height: 0};
    const measure = (width: number, height: number) => {
      const next = {width: round(width), height: round(height)};
      setSize(previous => (previous?.width === next.width && previous.height === next.height ? previous : next));
    };
    const initial = el.getBoundingClientRect();
    measure(round === Math.floor ? el.clientWidth : initial.width, initial.height);
    const observer = new ResizeObserver(entries => {
      const {width, height} = entries[0].contentRect;
      pending = {width, height};
      if (!interval) measure(width, height);
      else if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          measure(pending.width, pending.height);
        }, interval);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [round, interval]);
  return [ref, size] as const;
}

// The content width of an element, tracked through resizes; null until measured.
export function useContentWidth<E extends HTMLElement>() {
  const [ref, size] = useContentSize<E>();
  return [ref, size?.width ?? null] as const;
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

// The value as it stood once `ms` passed without a change; a text filter that costs a request waits on it. The
// default is a typing pause.
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

// How far outside the viewport a lazy card counts as near, so it loads before it scrolls in.
const nearMargin = 400;

// Whether the element is within `nearMargin` of the viewport; `onNear` runs each time it comes near.
export function useNearViewport(onNear?: () => void) {
  const [near, setNear] = useState(false);
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      // An element that mounts on screen reads as near in the first frame; waiting for the observer's first report
      // would paint the placeholder for a frame and make the page jump.
      const box = element.getBoundingClientRect();
      if (box.top < innerHeight + nearMargin && box.bottom > -nearMargin) {
        setNear(true);
        onNear?.();
      }
      const observer = new IntersectionObserver(
        entries => {
          const next = entries.at(-1)!.isIntersecting;
          setNear(next);
          if (next) onNear?.();
        },
        {rootMargin: `${nearMargin}px`}
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
    [onNear]
  );
  return [ref, near] as const;
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
