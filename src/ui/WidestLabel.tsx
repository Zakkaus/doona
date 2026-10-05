import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';

// The text properties a label's width depends on, copied from the label onto the one measuring span.
const textProps = [
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'letterSpacing',
  'fontFeatureSettings',
  'fontVariationSettings',
  'fontKerning',
  'textTransform'
] as const;
const widths = new Map<string, number>();
let probe: HTMLSpanElement | null = null;

// The widest of a list's labels in the label's own font, measured once per list and font in one reused hidden span.
// A font that finishes loading changes every width, so the cache starts over.
function widest(label: HTMLElement, labels: string[]) {
  const style = getComputedStyle(label);
  const key = [...textProps.map(prop => style[prop]), ...labels].join('\0');
  const known = widths.get(key);
  if (known !== undefined) return known;
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {position: 'absolute', insetInlineStart: '-10000px', top: '0', visibility: 'hidden', whiteSpace: 'pre'});
    document.fonts?.addEventListener('loadingdone', () => widths.clear());
  }
  if (!probe.isConnected) document.body.append(probe);
  for (const prop of textProps) probe.style[prop] = style[prop];
  let width = 0;
  for (const text of labels) {
    probe.textContent = text;
    width = Math.max(width, probe.getBoundingClientRect().width);
  }
  if (widths.size > 64) widths.clear();
  widths.set(key, Math.ceil(width));
  return Math.ceil(width);
}

// A trigger's label as wide as the widest of its choices, as a picker keeps its width: picking another choice moves
// nothing beside it. A longer label still shows whole.
export function WidestLabel({labels, children}: {labels: readonly string[]; children: ReactNode}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const key = labels.join('\0');
  useLayoutEffect(() => {
    const label = ref.current;
    if (!label) return;
    const measure = () => setWidth(widest(label, key ? key.split('\0') : []));
    measure();
    // Packing listeners must read the new label width in the same font event.
    const loaded = () => flushSync(measure);
    document.fonts?.addEventListener('loadingdone', loaded);
    return () => document.fonts?.removeEventListener('loadingdone', loaded);
  }, [key]);
  return (
    <span ref={ref} style={width ? {minInlineSize: width} : undefined}>
      {children}
    </span>
  );
}
