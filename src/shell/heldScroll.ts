import {useLayoutEffect} from 'react';

let held: {route: string; top: number} | null = null;
// How long the next tree keeps the offset against the browser's own resets.
const holdFor = 1000;
const readerInput = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
// The offset a reader had scrolled to when the startup frame went, which the next tree puts back when it shows the same
// page; any other page, or the sign-in page (no route), opens at the top. The startup Skeleton is as tall as the page,
// so the reader can scroll it, and WebKit drops the offset to the top when a new tree replaces it, as the tree's
// container queries lay out, sometimes frames after the first one; so a drop to the top puts it back until the hold
// ends, and any other scroll, the reader's or a page's own, ends it. The frame reads the offset as it goes, while its
// elements are still in the page.
export function useHeldScroll(route: string | undefined, startup: boolean) {
  useLayoutEffect(() => {
    const top = held && held.route === route ? held.top : held ? 0 : null;
    held = null;
    let release: (() => void) | undefined;
    if (top !== null) scrollTo(0, top);
    if (top) {
      const keep = () => {
        if (scrollY === 0) scrollTo(0, top);
        else if (scrollY !== top) release?.();
      };
      const timer = setTimeout(() => release?.(), holdFor);
      release = () => {
        clearTimeout(timer);
        removeEventListener('scroll', keep);
        for (const type of readerInput) removeEventListener(type, release!, true);
        release = undefined;
      };
      addEventListener('scroll', keep);
      for (const type of readerInput) addEventListener(type, release, true);
    }
    return () => {
      release?.();
      if (startup && route) held = {route, top: scrollY};
    };
  }, [route, startup]);
}
