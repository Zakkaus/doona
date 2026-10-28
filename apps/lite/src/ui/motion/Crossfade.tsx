/**
 * Content that replaces other content in place. When `swapKey` changes the
 * new content fades in (240ms); with a direction it also slides: `forward`
 * from the end side, `back` from the start side (wizard steps). The old
 * content leaves at once, nothing on mount, and nothing under reduced motion.
 *
 *   <Crossfade swapKey={activeTab} gap={SECTION_GAP}>{sections}</Crossfade>
 *
 * A block Crossfade stacks its children with `gap` (SECTION_GAP from
 * the screen's content gap) and is a MOTION_GROUP, so the page stagger still enters
 * its sections one by one.
 *   <Crossfade swapKey={step} direction={step > prev ? 'forward' : 'back'}>…
 */
import {useLayoutEffect, useRef} from 'react';
import type {ComponentProps, ReactNode} from 'react';
import {VStack} from '@astryxdesign/core/Stack';
import {EASE, MOTION, isRtl} from './tokens';
import {cancelOnReducedMotion, prefersReducedMotion} from './useReducedMotion';
import {MOTION_GROUP} from './pageStagger';

type SwapDirection = 'forward' | 'back' | 'none';

export function Crossfade({
  swapKey,
  direction = 'none',
  inline = false,
  fill = false,
  gap,
  children
}: {
  swapKey: string | number;
  direction?: SwapDirection;
  /** Sit in a line of text or a row (a status label) instead of a block. */
  inline?: boolean;
  /** Preserve a fill frame for scrollable ticket threads. */
  fill?: boolean;
  /** Gap between children of a block swap; SECTION_GAP for page sections. */
  gap?: ComponentProps<typeof VStack>['gap'];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(swapKey);
  useLayoutEffect(() => {
    // Keyed on the value, not on mount, so StrictMode's re-run stays still.
    if (last.current === swapKey) return;
    last.current = swapKey;
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const sign = direction === 'none' ? 0 : (direction === 'forward' ? 1 : -1) * (isRtl(el) ? -1 : 1);
    const animation = el.animate(
      [
        {opacity: 0, transform: `translateX(${sign * MOTION.swapShift}px)`},
        {opacity: 1, transform: 'none'}
      ],
      {duration: MOTION.swapDuration, easing: EASE}
    );
    return cancelOnReducedMotion([animation]);
  }, [swapKey, direction]);
  if (inline) {
    return (
      <VStack ref={ref} style={{display: 'inline-flex', minWidth: 0}}>
        {children}
      </VStack>
    );
  }
  return (
    <VStack ref={ref} {...MOTION_GROUP} style={{minWidth: 0, ...(fill ? {height: '100%', minHeight: 0} : {})}}>
      <VStack {...MOTION_GROUP} gap={gap} height={fill ? '100%' : undefined}>
        {children}
      </VStack>
    </VStack>
  );
}
