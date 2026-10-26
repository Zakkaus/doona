import {useEffect, useLayoutEffect, useRef} from 'react';
import {runPageStagger} from './motion';

export function focusPageHeading() {
  Array.from(document.querySelectorAll<HTMLElement>('h1'))
    .find(heading => heading.checkVisibility())
    ?.focus({preventScroll: true});
}

export function usePageMotion(ready: boolean) {
  const header = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  const headerEntered = useRef(false);
  useEffect(() => {
    const content = body.current?.closest<HTMLElement>('.lite-page-content');
    const heading = header.current;
    if (!content || !heading) return;
    const align = () => {
      heading.style.paddingInlineEnd = `${content.offsetWidth - content.clientWidth}px`;
    };
    const frame = requestAnimationFrame(align);
    const observer = new ResizeObserver(align);
    observer.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => header.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll: true}));
    const stopHeader = headerEntered.current ? () => {} : runPageStagger(header.current, null);
    headerEntered.current = true;
    return () => {
      cancelAnimationFrame(frame);
      stopHeader();
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready || entered.current) return;
    entered.current = true;
    body.current?.setAttribute('data-page-body', '');
  }, [ready]);
  return {header, body};
}
