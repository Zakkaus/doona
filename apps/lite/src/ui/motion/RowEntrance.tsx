/**
 * Table, list and option rows enter once, when the first real rows arrive.
 * One page of rows (PAGE_SIZE) rises and fades in, a stagger apart, starting
 * `rowLead` after the enclosing section begins its page entrance; later rows
 * appear instantly. Skeleton rows, dialogs and `data-row-entrance="off"` stay
 * static; sorting, filtering, paging, revisits and remounts within an
 * entered page do not replay it. The wrapper is `display: contents` and may
 * hold several lists.
 */
import {VStack} from '@astryxdesign/core/VStack';
import type {ReactNode} from 'react';
import {useLayoutEffect, useRef} from 'react';
import {PAGE_SIZE} from '../usePaged';
import {EASE, MOTION, PAGE_ENTER_ID, ROW_ENTER_ID} from './tokens';
import {cancelOnReducedMotion, onReducedMotion, prefersReducedMotion} from './useReducedMotion';

/** Time left before the nearest page entrance around `el` starts, if any. */
function pageEnterWait(el: Element): number {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const entry = node.getAnimations().find(a => a.id === PAGE_ENTER_ID);
    if (entry) return Math.max(0, Number(entry.effect?.getTiming().delay ?? 0) - Number(entry.currentTime ?? 0));
  }
  return 0;
}

const ROW_GROUPS = 'tbody, ul, ol, [role="radiogroup"], [role="listbox"]';
const STATIC = '[data-row-entrance="off"], dialog, [role="dialog"], [role="alertdialog"]';

/**
 * A list inside a table cell or another list already rises with its row.
 * A dialog can sit inside the wrapper or around it, and enters as one unit.
 */
function rowGroups(root: Element): Element[] {
  return Array.from(root.querySelectorAll(ROW_GROUPS)).filter(group => {
    const outer = group.parentElement?.closest(ROW_GROUPS);
    return (!outer || !root.contains(outer)) && !group.closest(STATIC);
  });
}

/** Page bodies whose rows have entered; a list mounted into one later stays static. */
const enteredPages = new WeakSet<Element>();

function enterRows(root: Element): Animation[] {
  const running: Animation[] = [];
  for (const group of rowGroups(root)) {
    const candidates = group.matches('[role="listbox"]') ? group.querySelectorAll('[role="option"]') : group.children;
    const delay = pageEnterWait(group) + MOTION.rowLead;
    let row = 0;
    // Stops at PAGE_SIZE so a long list measures only the rows that animate.
    for (const node of Array.from(candidates)) {
      if (row >= PAGE_SIZE) break;
      if (!(node instanceof HTMLElement) || node.getClientRects().length === 0) continue;
      running.push(
        node.animate(
          [
            {opacity: 0, transform: `translateY(${MOTION.rowRise}px)`},
            {opacity: 1, transform: 'none'}
          ],
          {id: ROW_ENTER_ID, duration: MOTION.rowDuration, delay: delay + row * MOTION.rowStagger, easing: EASE, fill: 'backwards'}
        )
      );
      row++;
    }
  }
  return running;
}

export function RowEntrance({children}: {children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);
  // Activity reruns this effect when a retained page shows again.
  const entered = useRef(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || entered.current || prefersReducedMotion()) return;
    const page = root.closest('[data-page-body]');
    if (page && enteredPages.has(page)) {
      entered.current = true;
      return;
    }
    const running: Animation[] = [];
    const stop = cancelOnReducedMotion(running);
    const enter = () => {
      if (entered.current) return true;
      if (prefersReducedMotion()) return (entered.current = true);
      if (root.closest('[data-placeholder]') || root.querySelector('[data-placeholder]')) return false;
      running.push(...enterRows(root));
      entered.current = running.length > 0;
      const body = root.closest('[data-page-body]');
      if (entered.current && body) enteredPages.add(body);
      return entered.current;
    };
    let observer: MutationObserver | null = null;
    const offWatch = onReducedMotion(() => {
      entered.current = true;
      observer?.disconnect();
    });
    // The page entrance starts in the page's layout effect, after this one;
    // a microtask still runs before the first paint.
    queueMicrotask(() => {
      if (!ref.current || enter()) return;
      observer = new MutationObserver(() => {
        if (enter()) observer?.disconnect();
      });
      // Skeleton rows stay static; the real rows enter when the placeholder clears.
      observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-placeholder']});
      const placeholder = root.closest('[data-placeholder]');
      if (placeholder) observer.observe(placeholder, {attributes: true, attributeFilter: ['data-placeholder']});
    });
    return () => {
      observer?.disconnect();
      offWatch();
      stop();
    };
  }, []);
  return (
    <VStack ref={ref} style={{display: 'contents'}}>
      {children}
    </VStack>
  );
}
