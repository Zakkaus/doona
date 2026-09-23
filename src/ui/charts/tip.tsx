import {useCallback, useRef, useState, useSyncExternalStore, type PointerEvent} from 'react';

type Tip = {x: number; y: number; width: number; lines: string[]};

const same = (a: Tip | null, b: Tip | null) =>
  a === b ||
  (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.lines.length === b.lines.length && a.lines.every((line, i) => line === b.lines[i]));

// The tip's state lives outside the chart and only `ChartTip` subscribes to it, so a pointer move re-renders the tip
// and not the chart that holds it.
function tipStore() {
  let current: Tip | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: Tip | null) {
      if (same(current, next)) return;
      current = next;
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }
  };
}
type TipStore = ReturnType<typeof tipStore>;

// A hover tip for the charts drawn without a chart library, in the same look as the activity charts' tooltips: it
// follows the pointer inside its chart and shows the hovered item in words. The chart's own accessible names carry
// the same facts, so the tip is for the eye only.
export function useChartTip<E extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<E>(null);
  const [tip] = useState(tipStore);
  const show = useCallback(
    (event: PointerEvent, lines: string[]) => {
      const box = ref.current?.getBoundingClientRect();
      if (box) tip.set({x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, lines});
    },
    [tip]
  );
  const hide = useCallback(() => tip.set(null), [tip]);
  return {ref, tip, show, hide};
}

export function ChartTip({tip: store}: {tip: TipStore}) {
  const tip = useSyncExternalStore(store.subscribe, store.get);
  if (!tip) return null;
  // Near an edge the tip opens inwards, so it is never cut off by the card.
  const side = tip.x > tip.width - 120 ? 'end' : tip.x < 120 ? 'start' : 'middle';
  return (
    <div className={'rp-charttip ' + side} style={{left: tip.x, top: tip.y}} aria-hidden="true">
      {tip.lines.map((line, i) => (i === 0 ? <b key={i}>{line}</b> : <span key={i}>{line}</span>))}
    </div>
  );
}
