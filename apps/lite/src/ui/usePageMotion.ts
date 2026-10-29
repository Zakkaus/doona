import {useLayoutEffect, useRef} from 'react';
import {runPageStagger} from './motion';

export function focusPageHeading() {
  Array.from(document.querySelectorAll<HTMLElement>('h1'))
    .find(heading => heading.checkVisibility())
    ?.focus({preventScroll: true});
}

// Suspense swaps a lazy page's loading frame for the page in one commit; the
// page continues the frame's header entrance instead of starting another.
const handoff = new Map<string, number>();

export function usePageMotion(ready: boolean) {
  const header = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  const headerStart = useRef<number | null>(null);
  useLayoutEffect(() => {
    const content = body.current?.closest<HTMLElement>('.lite-page-content');
    const heading = header.current;
    if (!content || !heading) return;
    const align = () => {
      heading.style.paddingInlineEnd = `${content.offsetWidth - content.clientWidth}px`;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => header.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll: true}));
    const title = header.current?.querySelector('h1')?.textContent ?? '';
    let stopEntrance = () => {};
    if (headerStart.current === null) {
      headerStart.current = handoff.get(title) ?? performance.now();
      stopEntrance = runPageStagger(header.current, body.current, performance.now() - headerStart.current);
    }
    return () => {
      cancelAnimationFrame(frame);
      stopEntrance();
      handoff.set(title, headerStart.current!);
      queueMicrotask(() => handoff.delete(title));
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready || entered.current) return;
    entered.current = true;
    body.current?.setAttribute('data-page-body', '');
  }, [ready]);
  return {header, body};
}
