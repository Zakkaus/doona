/** Header and sections enter together on mount, never again when page data becomes ready. */
import {EASE, MOTION, PAGE_ENTER_ID} from './tokens';
import {cancelOnReducedMotion, prefersReducedMotion} from './useReducedMotion';

export const MOTION_GROUP = {'data-motion-group': ''} as const;

function units(container: Element, out: HTMLElement[]) {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.hasAttribute('data-motion-group') || getComputedStyle(child).display === 'contents') {
      units(child, out);
      continue;
    }
    // Already entering through its own animation.
    if (child.getAnimations().length > 0) continue;
    const box = child.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    out.push(child);
  }
  return out;
}

/**
 * Runs the stagger, `elapsed` ms in; returns a cancel function for the effect
 * cleanup.
 */
export function runPageStagger(header: HTMLElement | null, body: HTMLElement | null, elapsed = 0): () => void {
  if (prefersReducedMotion()) return () => {};
  const running: Animation[] = [];
  const rise = (el: HTMLElement, step: number) =>
    running.push(
      el.animate(
        [
          {opacity: 0, transform: `translateY(${MOTION.pageRise}px)`},
          {opacity: 1, transform: 'none'}
        ],
        {
          id: PAGE_ENTER_ID,
          duration: MOTION.pageDuration,
          delay: step * MOTION.pageStagger - elapsed,
          easing: EASE,
          fill: 'backwards'
        }
      )
    );
  if (header) rise(header, 0);
  if (body) {
    const list = units(body, []);
    const pos = new Map(list.map(el => [el, el.getBoundingClientRect()]));
    list.sort((a, b) => {
      const ra = pos.get(a)!;
      const rb = pos.get(b)!;
      // Same row (within 8px) reads start to end.
      return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left;
    });
    list.forEach((el, i) => rise(el, Math.min(i + 1, MOTION.pageSteps)));
  }
  return cancelOnReducedMotion(running);
}
