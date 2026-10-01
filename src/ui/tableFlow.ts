import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';

export function flowInset(box: HTMLElement) {
  return Number.parseFloat(getComputedStyle(box).scrollPaddingTop) || 0;
}

export function revealFlowRow(box: HTMLElement, top: number, bottom: number) {
  const bounds = box.getBoundingClientRect();
  const inset = flowInset(box);
  const style = getComputedStyle(box);
  const end = window.innerHeight - (Number.parseFloat(style.getPropertyValue('--rp-flow-bottom') || style.scrollPaddingBottom) || 0);
  if (bounds.top + top < inset) window.scrollBy(0, bounds.top + top - inset);
  else if (bounds.top + bottom > end) window.scrollBy(0, bounds.top + bottom - end);
}

// RAC virtualises against the window; its horizontal scrollport still contains the sticky heading.
export function useTableFlow(
  enabled: boolean | undefined,
  stream: boolean | undefined,
  rows: {id: string}[],
  ref: RefObject<HTMLElement | null>,
  detailRef: RefObject<HTMLElement | null>,
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
      const detail = detailRef.current;
      const bottom = Number.parseFloat(getComputedStyle(box).scrollPaddingBottom) || 0;
      const covered = detail?.childElementCount ? window.innerHeight - detail.getBoundingClientRect().top : 0;
      box.style.setProperty('--rp-flow-bottom', `${Math.max(bottom, covered)}px`);
    };
    let frame = 0;
    const revealFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // RAC schedules its own viewport scroll in an effect; correct for the fixed shell after that frame.
        frame = requestAnimationFrame(() => {
          const row = document.activeElement?.closest<HTMLElement>('[role=row][data-key]');
          if (!row || !box.contains(row)) return;
          const bounds = row.getBoundingClientRect();
          const top = box.getBoundingClientRect().top;
          revealFlowRow(box, bounds.top - top, bounds.bottom - top);
        });
      });
    };
    place();
    box.addEventListener('focusin', revealFocus);
    window.addEventListener('scroll', place, {passive: true});
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(() => {
      place();
      revealFocus();
    });
    observer.observe(box);
    if (detailRef.current) observer.observe(detailRef.current);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener('focusin', revealFocus);
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      observer.disconnect();
      box.style.removeProperty('--rp-flow-heading');
      box.style.removeProperty('--rp-flow-bottom');
    };
  }, [enabled, ref, detailRef, heading]);

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
