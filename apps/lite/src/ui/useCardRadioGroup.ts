/**
 * Keyboard and tree behaviour for a group of SelectableCards that act as one
 * radio group: arrow keys move the selection and focus,
 * Space and Enter select, and the checkbox each card renders leaves the tab
 * order and the accessibility tree.
 */
import {useLayoutEffect, useRef, type KeyboardEvent} from 'react';

export function useCardRadioGroup(ids: readonly string[], select: (id: string) => void, idAttribute: string) {
  const group = useRef<HTMLDivElement>(null);
  // SelectableCard renders a checkbox it does not let us configure; the
  // card itself is the radio. React does not manage these two attributes.
  useLayoutEffect(() => {
    group.current?.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.setAttribute('tabindex', '-1');
      input.setAttribute('aria-hidden', 'true');
    });
  });
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const isRtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      ArrowRight: isRtl ? -1 : 1,
      ArrowLeft: isRtl ? 1 : -1
    };
    if (event.nativeEvent.isComposing) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      select(ids[index]);
      return;
    }
    if (!(event.key in step)) return;
    event.preventDefault();
    const next = ids[(index + step[event.key] + ids.length) % ids.length];
    select(next);
    group.current?.querySelector<HTMLElement>(`[${idAttribute}="${CSS.escape(next)}"]`)?.focus();
  };
  return {group, onKeyDown};
}
