import {useCallback, useRef, useState, type PointerEvent} from 'react';

type Tip = {x: number; y: number; width: number; lines: string[]};

// A hover tip for the charts drawn without a chart library, in the same look as the activity charts' tooltips: it
// follows the pointer inside its chart and shows the hovered item in words. The chart's own accessible names carry
// the same facts, so the tip is for the eye only.
export function useChartTip<E extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<E>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((event: PointerEvent, lines: string[]) => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setTip({x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, lines});
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return {ref, tip, show, hide};
}

export function ChartTip({tip}: {tip: Tip | null}) {
  if (!tip) return null;
  // Near an edge the tip opens inwards, so it is never cut off by the card.
  const side = tip.x > tip.width - 120 ? 'end' : tip.x < 120 ? 'start' : 'middle';
  return (
    <div className={'rp-charttip ' + side} style={{left: tip.x, top: tip.y}} aria-hidden="true">
      {tip.lines.map((line, i) => (i === 0 ? <b key={i}>{line}</b> : <span key={i}>{line}</span>))}
    </div>
  );
}
