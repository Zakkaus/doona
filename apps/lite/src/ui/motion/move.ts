import {EASE, MOTION} from './tokens';
import {cancelOnReducedMotion, prefersReducedMotion} from './useReducedMotion';

export function animateMove(control: HTMLElement | null) {
  if (!control || prefersReducedMotion()) return;
  const row = control.closest('li, tr') ?? control;
  const animation = row.animate(
    [
      {opacity: 0.6, transform: `scale(${MOTION.moveScale})`},
      {opacity: 1, transform: 'none'}
    ],
    {id: 'item-move', duration: MOTION.moveDuration, easing: EASE}
  );
  const stop = cancelOnReducedMotion([animation]);
  void animation.finished.then(stop, stop);
}
