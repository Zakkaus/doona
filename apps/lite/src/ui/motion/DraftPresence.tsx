import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {EASE, MOTION} from './tokens';
import {cancelOnReducedMotion, useReducedMotion} from './useReducedMotion';

export function DraftPresence({children}: {children: ReactNode}) {
  const visible = !!children;
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(visible);
  const last = useRef(children);
  const ref = useRef<HTMLDivElement>(null);
  if (visible) last.current = children;
  // Toasts rise above an open draft footer so they never cover its primary action.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!visible || !node) return;
    let height = 0;
    const announce = (next: number) => {
      if (height === next) return;
      height = next;
      window.dispatchEvent(new CustomEvent('lite-draft-offset', {detail: height}));
    };
    const observer = new ResizeObserver(() => announce(node.offsetHeight));
    observer.observe(node, {box: 'border-box'});
    announce(node.offsetHeight);
    return () => {
      observer.disconnect();
      announce(0);
    };
  }, [visible]);
  useLayoutEffect(() => {
    if (reduced) {
      setPresent(visible);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (visible) setPresent(true);
    const hidden = {opacity: 0, transform: `translateY(${MOTION.draftShift}px)`};
    const shown = {opacity: 1, transform: 'none'};
    const animation = node.animate(visible ? [hidden, shown] : [shown, hidden], {duration: MOTION.draftDuration, easing: EASE});
    const stop = cancelOnReducedMotion([animation]);
    if (!visible)
      void animation.finished.then(
        () => setPresent(false),
        () => {}
      );
    return stop;
  }, [visible, reduced]);
  if (!visible && (!present || reduced)) return null;
  return (
    <VStack ref={ref} inert={!visible} data-draft-bar>
      {visible ? children : last.current}
    </VStack>
  );
}
