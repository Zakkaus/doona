import {useId, useState} from 'react';
import {useContentSize} from '../hooks';
import {linearPosition, nearestIndex} from './layout';
import {pointerPosition} from './interaction';
import {Curve, Gradient} from './AreaCurve';

export function SparkPlot({
  values,
  timestamps,
  color,
  height = 32,
  floor = 0
}: {
  values: Array<number | null>;
  timestamps: number[];
  color: string;
  height?: number;
  floor?: number;
}) {
  const uid = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round, 120);
  const known = values.filter((value): value is number => value !== null);
  const domain: [number, number] = [floor > 0 ? 0 : Math.min(...known) * 0.85, Math.max(Math.max(...known) * 1.05 || 1, floor)];
  const x = (value: number) => linearPosition(value, [Math.min(...timestamps), Math.max(...timestamps)], [0, size?.width ?? 0]);
  const y = (value: number) => linearPosition(value, domain, [(size?.height ?? height) - 2, 2]);
  return (
    <div ref={ref} style={{height, width: '100%'}} aria-hidden={known.length ? true : undefined} onPointerLeave={() => setSelected(null)}>
      {known.length > 0 && size && (
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
            <circle cx={x(timestamps[selected])} cy={y(values[selected]!)} r={4} fill={color} stroke="#fff" strokeWidth={2} />
          )}
        </svg>
      )}
    </div>
  );
}
