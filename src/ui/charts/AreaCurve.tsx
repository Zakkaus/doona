import {area, line, curveMonotoneX} from 'd3-shape';

export function Gradient({id, color}: {id: string; color: string}) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.35} />
      <stop offset="100%" stopColor={color} stopOpacity={0.03} />
    </linearGradient>
  );
}
export function Curve({
  points,
  baseline,
  color,
  id,
  strokeWidth
}: {
  points: Array<{x: number; y: number} | null>;
  baseline: number;
  color: string;
  id: string;
  strokeWidth: number;
}) {
  if (points.length === 1) {
    const point = points[0];
    return point ? <circle cx={point.x} cy={point.y} r={3} stroke={color} strokeWidth={strokeWidth} fill={`url(#${id})`} fillOpacity={0.6} /> : null;
  }
  const defined = (point: (typeof points)[number]) => point !== null && Number.isFinite(point.x) && Number.isFinite(point.y);
  const stroke = line<(typeof points)[number]>()
    .defined(defined)
    .x(point => point!.x)
    .y(point => point!.y)
    .curve(curveMonotoneX)
    .digits(3);
  const fill = area<(typeof points)[number]>()
    .defined(defined)
    .x(point => point!.x)
    .y0(baseline)
    .y1(point => point!.y)
    .curve(curveMonotoneX)
    .digits(3);
  return (
    <g>
      <path d={fill(points) ?? undefined} stroke="none" fill={`url(#${id})`} fillOpacity={0.6} />
      <path className="rp-area-curve" d={stroke(points) ?? undefined} stroke={color} strokeWidth={strokeWidth} fill="none" />
    </g>
  );
}
