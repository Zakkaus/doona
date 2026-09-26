import {useId, useLayoutEffect, useState} from 'react';
import {localTimeFormat} from '../../i18n/format';
import {useContentSize} from '../hooks';
import {usePalette} from './palette';
import {ChartTip, useChartTip} from './tip';
import {linearPosition, nearestIndex} from './layout';
import {pointerPosition} from './interaction';
import {Curve, Gradient} from './AreaCurve';

// The box the tip must stay inside, relative to the sparkline: the padding box of the nearest ancestor that clips,
// which in a tile is its card, or else the viewport.
function tipBounds(own: HTMLElement) {
  let clip = own.parentElement;
  while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement;
  const at = own.getBoundingClientRect();
  if (!clip) return {x: -at.left, y: -at.top, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight};
  const box = clip.getBoundingClientRect();
  return {x: box.left + clip.clientLeft - at.left, y: box.top + clip.clientTop - at.top, width: clip.clientWidth, height: clip.clientHeight};
}

// A tile's trend line. It stays hidden from assistive technology, since the tile's number carries the value; with
// `fmt` and `locale` a pointer over it shows the hovered sample's value and time.
export function SparkPlot({
  values,
  timestamps,
  color,
  fmt,
  locale,
  height = 32,
  floor = 0
}: {
  values: Array<number | null>;
  timestamps: number[];
  color: string;
  fmt?: (value: number) => string;
  locale?: string;
  height?: number;
  floor?: number;
}) {
  const uid = useId();
  const p = usePalette();
  const [selected, setSelected] = useState<number | null>(null);
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round, 120);
  const {tip, showAt, hide} = useChartTip();
  const known = values.filter((value): value is number => value !== null);
  const domain: [number, number] = [floor > 0 ? 0 : Math.min(...known) * 0.85, Math.max(Math.max(...known) * 1.05 || 1, floor)];
  const x = (value: number) => linearPosition(value, [Math.min(...timestamps), Math.max(...timestamps)], [0, size?.width ?? 0]);
  const y = (value: number) => linearPosition(value, domain, [(size?.height ?? height) - 2, 2]);
  useLayoutEffect(() => {
    if (selected === null || values[selected] == null || !fmt || !locale || !ref.current || !size) {
      hide();
      return;
    }
    showAt({
      x: x(timestamps[selected]),
      y: y(values[selected]!),
      width: size.width,
      bounds: tipBounds(ref.current),
      label: localTimeFormat(locale).format(timestamps[selected]),
      lines: [fmt(values[selected]!)]
    });
  });
  return (
    <div ref={ref} style={{height, width: '100%', position: 'relative'}} aria-hidden={known.length ? true : undefined} onPointerLeave={() => setSelected(null)}>
      {known.length > 0 && size && (
        <>
          <ChartTip tip={tip} />
          <svg
            className="rp-activity-surface"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            style={{display: 'block'}}
            onPointerMove={event => {
              const point = pointerPosition(event, event.currentTarget, size);
              setSelected(point.x < 0 || point.x > size.width || point.y < 2 || point.y > size.height - 2 ? null : nearestIndex(timestamps.map(x), point.x));
            }}
          >
            <defs>
              <Gradient id={uid} color={color} />
            </defs>
            <Curve
              points={values.map((value, i) => (value === null ? null : {x: x(timestamps[i]), y: y(value)}))}
              baseline={y(Math.max(0, domain[0]))}
              color={color}
              id={uid}
              strokeWidth={1.5}
            />
            {selected !== null && values[selected] != null && (
              <circle cx={x(timestamps[selected])} cy={y(values[selected]!)} r={4} fill={color} stroke={p.base} strokeWidth={2} />
            )}
          </svg>
        </>
      )}
    </div>
  );
}
