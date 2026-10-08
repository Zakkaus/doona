import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';

function flowInset(box: HTMLElement) {
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

const scrollSettle = 250;

// Whether the target sits in a box that scrolls vertically on its own, in the wheel's direction when one is given, so the
// gesture moves that box instead of the page.
export function scrollsOwnBox(target: EventTarget | null, deltaY = 0) {
  for (let node = target as Element | null; node?.parentElement && node !== document.body; node = node.parentElement) {
    const room = node.scrollHeight - node.clientHeight;
    if (room > 0 && /auto|scroll/.test(getComputedStyle(node).overflowY) && (deltaY < 0 ? node.scrollTop > 0 : !deltaY || Math.ceil(node.scrollTop) < room))
      return true;
  }
  return false;
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
    // Reads come before writes, and a value is written only when it changes: a custom property set on the grid restyles
    // every row, so a write between reads would force a style and layout pass of the whole grid.
    const write = (name: string, value: string) => {
      if (box.style.getPropertyValue(name) !== value) box.style.setProperty(name, value);
    };
    const place = () => {
      const inset = flowInset(box) - heading;
      const offset = Math.max(0, Math.min(inset - box.getBoundingClientRect().top, box.clientHeight - heading));
      const detail = detailRef.current;
      const bottom = Number.parseFloat(getComputedStyle(box).scrollPaddingBottom) || 0;
      const covered = detail?.childElementCount ? window.innerHeight - detail.getBoundingClientRect().top : 0;
      write('--rp-flow-heading', `${offset}px`);
      write('--rp-flow-bottom', `${Math.max(bottom, covered)}px`);
    };
    // Scrolling places the heading once per frame, just before the frame lays out.
    let placing = 0;
    const placeInFrame = () => {
      if (!placing)
        placing = requestAnimationFrame(() => {
          placing = 0;
          place();
        });
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
    window.addEventListener('scroll', placeInFrame, {passive: true});
    window.addEventListener('resize', placeInFrame);
    const observer = new ResizeObserver(() => {
      place();
      revealFocus();
    });
    observer.observe(box);
    if (detailRef.current) observer.observe(detailRef.current);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(placing);
      box.removeEventListener('focusin', revealFocus);
      window.removeEventListener('scroll', placeInFrame);
      window.removeEventListener('resize', placeInFrame);
      observer.disconnect();
      box.style.removeProperty('--rp-flow-heading');
      box.style.removeProperty('--rp-flow-bottom');
    };
  }, [enabled, ref, detailRef, heading]);

  // Until when the person's own scrolling holds the view: a vertical wheel or mainly vertical touch movement that moves the
  // page starts it, and scroll events during it, such as momentum, extend it. A prepend then leaves the view to them
  // instead of fighting their movement. A click, a zoom wheel, a sideways swipe or a gesture taken by a box that scrolls
  // on its own leaves the page still, so the view keeps its anchor.
  const scrolling = useRef(0);
  useEffect(() => {
    if (!enabled || !stream) return;
    const hold = () => (scrolling.current = performance.now() + scrollSettle);
    const wheel = (event: WheelEvent) => event.deltaY && !event.ctrlKey && !scrollsOwnBox(event.target, event.deltaY) && hold();
    const extend = () => performance.now() < scrolling.current && hold();
    let touch: Touch | undefined;
    let own = false;
    const start = (event: TouchEvent) => {
      touch = event.touches[0];
      own = scrollsOwnBox(event.target);
    };
    const move = ({touches: [point]}: TouchEvent) =>
      touch && point && !own && Math.abs(point.clientY - touch.clientY) > Math.abs(point.clientX - touch.clientX) && hold();
    window.addEventListener('wheel', wheel, {passive: true});
    window.addEventListener('touchstart', start, {passive: true});
    window.addEventListener('touchmove', move, {passive: true});
    window.addEventListener('scroll', extend, {passive: true});
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('scroll', extend);
      scrolling.current = 0;
    };
  }, [enabled, stream]);

  const previous = useRef(rows);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = rows;
    const box = ref.current;
    if (!enabled || !stream || !box || before === rows || !before.length || before[0]?.id === rows[0]?.id) return;
    if (performance.now() < scrolling.current) return;
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
