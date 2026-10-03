import {useCallback, useId, useLayoutEffect, useMemo, useState} from 'react';
import {localTimeFormat} from '../../i18n/format';
import {useContentSize} from '../hooks';
import {usePalette} from './palette';
import {ChartTip, tipBounds, useChartTip} from './tip';
import {linearPosition, nearestIndex} from './layout';
import {pointerPosition} from './interaction';
import {Curve, Gradient} from './AreaCurve';

// A tile's trend line. It stays hidden from assistive technology, since the tile's number carries the value; with
// `fmt` and `locale` a pointer over it shows the hovered sample's value (or `lines`) and time.
export function SparkPlot({
  values,
  timestamps,
  color,
  fmt,
  locale,
  height = 32,
  floor = 0,
  inset = 0,
  lines
}: {
  values: Array<number | null>;
  timestamps: number[];
  color: string;
  fmt?: (value: number) => string;
  locale?: string;
  height?: number;
  floor?: number;
  inset?: number;
  // The tip's lines for a sample, when it reads more than this line's value (every series of a split chart).
  lines?: (index: number) => string[];
}) {
  const uid = useId();
  const p = usePalette();
  const [selected, setSelected] = useState<number | null>(null);
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round, 120);
  const {tip, showAt, hide} = useChartTip();
  const known = useMemo(() => values.filter((value): value is number => value !== null), [values]);
  // A single sample is no trend: the box keeps its height and the line waits for a second one.
  const drawn = known.length > 1;
  const domain = useMemo<[number, number]>(() => [floor > 0 ? 0 : Math.min(...known) * 0.85, Math.max(Math.max(...known) * 1.05 || 1, floor)], [known, floor]);
  const width = size?.width ?? 0;
  const bottom = (size?.height ?? height) - 2;
  const xs = useMemo(() => {
    const span: [number, number] = [Math.min(...timestamps), Math.max(...timestamps)];
    return timestamps.map(value => linearPosition(value, span, [inset, Math.max(inset, width - inset)]));
  }, [timestamps, width, inset]);
  const y = useCallback((value: number) => linearPosition(value, domain, [bottom, 2]), [domain, bottom]);
  const points = useMemo(() => values.map((value, i) => (value === null ? null : {x: xs[i], y: y(value)})), [values, xs, y]);
  useLayoutEffect(() => {
    if (selected === null || values[selected] == null || !fmt || !locale || !ref.current || !size) {
      hide();
      return;
    }
    showAt({
      x: xs[selected],
      y: y(values[selected]!),
      width: size.width,
      bounds: tipBounds(ref.current),
      label: localTimeFormat(locale).format(timestamps[selected]),
      lines: lines?.(selected) ?? [fmt(values[selected]!)]
    });
  });
  return (
    // A dashboard tile sizes its sparkline through --rp-spark-fill (see dashboard.css); the drawing is out of flow, so
    // it follows its box both ways and never holds it at an earlier size.
    <div
      ref={ref}
      style={{height: `var(--rp-spark-fill, ${height}px)`, width: '100%', position: 'relative'}}
      aria-hidden={drawn ? true : undefined}
      onPointerLeave={() => setSelected(null)}
    >
      {drawn && size && (
        <>
          <ChartTip tip={tip} />
          <svg
            className="rp-activity-surface"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            style={{display: 'block', position: 'absolute', inset: 0}}
            onPointerMove={event => {
              const point = pointerPosition(event, event.currentTarget, size);
              setSelected(point.x < 0 || point.x > size.width || point.y < 2 || point.y > size.height - 2 ? null : nearestIndex(xs, point.x));
            }}
          >
            <defs>
              <Gradient id={uid} color={color} />
            </defs>
            <Curve points={points} baseline={y(Math.max(0, domain[0]))} color={color} id={uid} strokeWidth={1.5} />
            {selected !== null && values[selected] != null && (
              <circle cx={xs[selected]} cy={y(values[selected]!)} r={4} fill={color} stroke={p.base} strokeWidth={2} />
            )}
          </svg>
        </>
      )}
    </div>
  );
}
