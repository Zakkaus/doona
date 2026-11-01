import {useEffect} from 'react';

// What a link lands on: the element that scrolls into view and is marked, and the one that takes focus when that is not
// the target itself (none, when the target has no control to focus yet). A provisional target stands in while the one
// the link names has not mounted: it is shown and marked, but the wait for the named one goes on.
export type Landing = {target: HTMLElement; focus?: HTMLElement | null; provisional?: boolean};

// What the reader does to the page by hand, which ends the landing for good.
const readerInput = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
// How long the target is waited for, how long it is followed once found, and how long it stays marked.
const waitMs = 5000;
const followMs = 3000;
const markMs = 3000;

// A card that fits between the top and bottom bars shows from its title, so the field a link names has its context;
// a taller one centres the field. A card linked as a whole always shows from its title; a block outside any card, which
// keeps no scroll margin for the top bar, is centred.
function place(target: HTMLElement, control?: HTMLElement | null) {
  const card = target.closest<HTMLElement>('.rp-card');
  if (!card) {
    target.scrollIntoView({block: 'center'});
    return;
  }
  const bars = document.querySelector('.rp-popover-band');
  const style = bars && getComputedStyle(bars);
  const room = innerHeight - (parseFloat(style?.top ?? '') || 0) - (parseFloat(style?.bottom ?? '') || 0);
  // The card's own scroll margin keeps it below the top bar, with this gap.
  if (card === target || card.getBoundingClientRect().height + 16 <= room) card.scrollIntoView({block: 'start'});
  else target.scrollIntoView({block: 'center'});
  // A control inside a list that scrolls on its own may sit out of sight in it.
  control?.scrollIntoView({block: 'nearest'});
}

// Scrolls to the element `find` returns, focuses it and marks it for three seconds. It is waited for while it mounts and
// followed while the page above it settles, until the reader scrolls or presses a key themselves. Returns the stop.
function land(find: () => Landing | null): () => void {
  let current: HTMLElement | null = null;
  let marked: HTMLElement | null = null;
  let markTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  const mark = (target: HTMLElement | null) => {
    clearTimeout(markTimer);
    marked?.removeAttribute('data-highlighted');
    marked = target;
    marked?.setAttribute('data-highlighted', 'true');
    if (marked) markTimer = setTimeout(() => mark(null), markMs);
  };
  const settle = () => {
    frame = 0;
    const found = find();
    if (!found) return;
    if (found.target !== current) {
      current = found.target;
      mark(current);
      if (!found.provisional) {
        clearTimeout(deadline);
        deadline = setTimeout(stop, followMs);
      }
    }
    place(found.target, found.focus);
    const focus = found.focus === undefined ? found.target : found.focus;
    if (focus && !focus.contains(document.activeElement)) {
      if (!focus.hasAttribute('tabindex') && focus.tabIndex < 0) focus.tabIndex = -1;
      focus.focus({preventScroll: true});
    }
  };
  const again = () => {
    frame ||= requestAnimationFrame(settle);
  };
  // The document grows as the cards above the target load; a card can also swap its heading without changing its size.
  const growth = new ResizeObserver(again);
  const changes = new MutationObserver(again);
  const stop = () => {
    clearTimeout(deadline);
    cancelAnimationFrame(frame);
    growth.disconnect();
    changes.disconnect();
    for (const type of readerInput) removeEventListener(type, stop, true);
  };
  let deadline = setTimeout(stop, waitMs);
  growth.observe(document.documentElement);
  changes.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-wait']});
  for (const type of readerInput) addEventListener(type, stop, {capture: true, passive: true});
  settle();
  return () => {
    stop();
    mark(null);
  };
}

// Lands once per `key`, from when it turns up and once `ready`; a re-render does not land again, and following a link to
// the same place later does. `find` is read as the page changes and reads only what the key names.
export function useLanding(key: string | null | undefined, find: () => Landing | null, ready = true) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for everything `find` reads
  useEffect(() => (key && ready ? land(find) : undefined), [key, ready]);
}

// The control of a field inside `root`, and the row around it that is marked: a field's wrapper takes no box of its own
// when it only passes its children on, so the first of them is the row. A control that is hidden or disabled leaves the
// row, or nothing while it is not there. A listbox keeps no tab stop but its focused option, so its selected option is
// the one to land on.
export function fieldLanding(root: ParentNode, id: string): Landing | null {
  const wrapper = root.querySelector<HTMLElement>(`[data-setting="${CSS.escape(id)}"]`);
  if (!wrapper) return null;
  const control = Array.from(wrapper.querySelectorAll<HTMLElement>('input, button, textarea, [role=option][aria-selected=true]')).find(
    element => (element.tabIndex >= 0 || element.matches('[role=option]')) && !element.matches(':disabled') && !element.closest('[aria-hidden="true"]')
  );
  const row = getComputedStyle(wrapper).display === 'contents' ? (wrapper.firstElementChild as HTMLElement | null) : wrapper;
  return row && {target: row, focus: control ?? null};
}
