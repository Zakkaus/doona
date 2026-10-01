import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';

export function flowInset(box: HTMLElement) {
  return Number.parseFloat(getComputedStyle(box).scrollPaddingTop) || 0;
}

export function revealFlowRow(box: HTMLElement, top: number, bottom: number) {
  const bounds = box.getBoundingClientRect();
  const inset = flowInset(box);
  if (bounds.top + top < inset) window.scrollBy(0, bounds.top + top - inset);
  else if (bounds.top + bottom > window.innerHeight) window.scrollBy(0, bounds.top + bottom - window.innerHeight);
}

// RAC virtualises against the window; its horizontal scrollport still contains the sticky heading.
export function useTableFlow(
  enabled: boolean | undefined,
  stream: boolean | undefined,
  rows: {id: string}[],
  ref: RefObject<HTMLElement | null>,
  heading: number,
  rowHeight: number
) {
  useEffect(() => {
    const box = ref.current;
    if (!enabled || !box) return;
    const place = () => {
      const inset = flowInset(box) - heading;
      const offset = Math.max(0, Math.min(inset - box.getBoundingClientRect().top, box.clientHeight - heading));
      box.style.setProperty('--rp-flow-heading', `${offset}px`);
    };
    place();
    window.addEventListener('scroll', place, {passive: true});
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => {
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      observer.disconnect();
      box.style.removeProperty('--rp-flow-heading');
    };
  }, [enabled, ref, heading]);

  const previous = useRef(rows);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = rows;
    const box = ref.current;
    if (!enabled || !stream || !box || before === rows || !before.length || before[0]?.id === rows[0]?.id) return;
    // Filtering starts a new view; a prepend keeps the record beneath the heading at the same screen position.
    if (!rows.some(row => row.id === before[0].id)) return;
    const top = box.getBoundingClientRect().top;
    const inset = flowInset(box);
    if (top >= inset - heading) return;
    const at = Math.min(before.length - 1, Math.max(0, Math.floor((inset - top - heading) / rowHeight)));
    const next = rows.findIndex(row => row.id === before[at].id);
    if (next >= 0 && next !== at) window.scrollBy(0, (next - at) * rowHeight);
  }, [enabled, stream, rows, ref, heading, rowHeight]);
}
