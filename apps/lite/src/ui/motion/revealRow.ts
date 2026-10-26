import {EASE, MOTION, ROW_ENTER_ID} from './tokens';
import {cancelOnReducedMotion, prefersReducedMotion} from './useReducedMotion';

export function revealRow(row: HTMLElement | null, added = false) {
  if (!row) return;
  row.scrollIntoView({block: 'nearest'});
  row.focus({preventScroll: true});
  if (prefersReducedMotion()) return;
  const animation = row.animate([{backgroundColor: 'var(--color-background-muted)'}, {backgroundColor: 'transparent'}], {
    id: 'row-highlight',
    duration: MOTION.moveDuration * 3,
    easing: EASE
  });
  // RowEntrance may already be entering the first row of a list.
  const entrance =
    added && !row.getAnimations().some(a => a.id === ROW_ENTER_ID)
      ? row.animate(
          [
            {opacity: 0, transform: `translateY(${MOTION.rowRise}px)`},
            {opacity: 1, transform: 'none'}
          ],
          {
            id: ROW_ENTER_ID,
            duration: MOTION.rowDuration,
            easing: EASE
          }
        )
      : null;
  const stop = cancelOnReducedMotion(entrance ? [animation, entrance] : [animation]);
  void animation.finished.then(stop, stop);
}
