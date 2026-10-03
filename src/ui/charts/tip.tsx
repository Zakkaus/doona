import {useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent} from 'react';
import {pointerPosition} from './interaction';
import {useContentSize} from '../hooks';
import {NodeName} from '../NodeName';

type Tip = {
  x: number;
  y: number;
  width: number;
  lines: string[];
  nodeName?: boolean;
  label?: string;
  bounds?: {x: number; y: number; width: number; height: number};
};

const same = (a: Tip | null, b: Tip | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.label === b.label &&
    a.nodeName === b.nodeName &&
    a.bounds?.x === b.bounds?.x &&
    a.bounds?.y === b.bounds?.y &&
    a.bounds?.height === b.bounds?.height &&
    a.bounds?.width === b.bounds?.width &&
    a.lines.length === b.lines.length &&
    a.lines.every((line, i) => line === b.lines[i]));

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
// The box the tip must stay inside, relative to the sparkline: the padding box of the nearest ancestor that clips,
// which in a tile is its card, or else the viewport.
export function tipBounds(own: HTMLElement) {
  let clip = own.parentElement;
  while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement;
  const at = own.getBoundingClientRect();
  if (!clip) return {x: -at.left, y: -at.top, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight};
  const box = clip.getBoundingClientRect();
  return {x: box.left + clip.clientLeft - at.left, y: box.top + clip.clientTop - at.top, width: clip.clientWidth, height: clip.clientHeight};
}

export function useChartTip<E extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<E>(null);
  const [tip] = useState(tipStore);
  const show = useCallback(
    (event: PointerEvent, lines: string[], nodeName?: boolean) => {
      if (ref.current) tip.set({...pointerPosition(event, ref.current), lines, nodeName});
    },
    [tip]
  );
  const hide = useCallback(() => tip.set(null), [tip]);
  return {ref, tip, show, showAt: tip.set, hide};
}

export function ChartTip({tip: store}: {tip: TipStore}) {
  const tip = useSyncExternalStore(store.subscribe, store.get);
  if (!tip) return null;
  if (tip.bounds) return <BoundedTip tip={tip} />;
  // Near an edge the tip opens inwards, so it is never cut off by the card.
  const side = tip.x > tip.width - 120 ? 'end' : tip.x < 120 ? 'start' : 'middle';
  return (
    <div className={'rp-charttip ' + side} style={{left: tip.x, top: tip.y}} aria-hidden="true">
      {tip.lines.map((line, i) => (i === 0 ? <b key={i}>{tip.nodeName ? <NodeName name={line} /> : line}</b> : <span key={i}>{line}</span>))}
    </div>
  );
}

const exactSize = (value: number) => value;
function BoundedTip({tip}: {tip: Tip}) {
  const [ref, size] = useContentSize<HTMLDivElement>(exactSize);
  const [dismissed, setDismissed] = useState<{x: number; y: number} | null>(null);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed({x: tip.x, y: tip.y});
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [tip.x, tip.y]);
  if (dismissed && (dismissed.x !== tip.x || dismissed.y !== tip.y)) setDismissed(null);
  const bounds = tip.bounds!;
  // Open after the point, or before it when that runs past the end; then keep the whole tip inside the bounds,
  // since with a tall tip in a short card neither side may fit.
  const place = (coordinate: number, dimension: number, start: number, length: number) => {
    const open = coordinate + 10 + dimension > start + length ? coordinate - dimension - 10 : coordinate + 10;
    return Math.max(start, Math.min(open, start + length - dimension));
  };
  const x = place(tip.x, size?.width ?? 0, bounds.x, bounds.width);
  const y = place(tip.y, size?.height ?? 0, bounds.y, bounds.height);
  return (
    <div
      ref={ref}
      className="rp-charttip-bounded"
      style={{
        visibility: size && !(dismissed?.x === tip.x && dismissed?.y === tip.y) ? 'visible' : 'hidden',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        left: 0,
        transform: `translate(${x}px, ${y}px)`
      }}
    >
      {/* Never wider than the bounds, so a narrow card wraps it instead of cutting it off. */}
      <div role="status" aria-live="polite" className="rp-boundedtip" style={{maxInlineSize: bounds.width}}>
        <p>{tip.label}</p>
        <ul>
          {tip.lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
