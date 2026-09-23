import {useMemo} from 'react';
import {useContentWidth} from '../hooks';
import {logDomain, logPosition, logTicks, swarm} from './layout';

export type SwarmPoint = {id: string; value: number; color: string; title: string};
export type SwarmMark = {value: number; label: string};
export type SwarmRow = {id: string; label: string; detail: string; points: SwarmPoint[]; mark?: number};

const inset = 12;

// One dot per sample on a log axis, packed so every dot stays visible; marks label reference values such as the
// typical and the slowest. Rows below repeat the axis as thin strips, one per group, on the same scale.
export function Beeswarm({
  label,
  points,
  marks = [],
  rows = [],
  fmt,
  height = 132
}: {
  label: string;
  points: SwarmPoint[];
  marks?: SwarmMark[];
  rows?: SwarmRow[];
  fmt: (value: number) => string;
  height?: number;
}) {
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const domain = useMemo(() => logDomain(points.map(point => point.value)), [points]);
  const ticks = useMemo(() => logTicks(domain, width && width < 480 ? 4 : 8), [domain, width]);
  const track = Math.max((width ?? 0) - inset * 2, 1);
  const x = (value: number) => inset + logPosition(value, domain) * track;
  // Dense samples get smaller dots so a thousand lookups still fit the band.
  const radius = points.length > 400 ? 2 : points.length > 120 ? 3 : 4;
  const band = height - 36;
  const ys = useMemo(
    () =>
      width
        ? swarm(
            points.map(point => inset + logPosition(point.value, domain) * track),
            radius,
            band / 2
          )
        : [],
    [points, domain, track, radius, band, width]
  );
  return (
    <div className="rp-swarm" ref={ref}>
      {width !== null && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map(tick => (
            <g key={tick}>
              <line className="grid" x1={x(tick)} x2={x(tick)} y1={16} y2={height - 18} />
              <text className="tick" x={x(tick)} y={height - 4} textAnchor="middle">
                {fmt(tick)}
              </text>
            </g>
          ))}
          {points.map((point, i) => (
            <circle key={point.id} cx={x(point.value)} cy={16 + band / 2 + (ys[i] ?? 0)} r={radius} fill={point.color}>
              <title>{point.title}</title>
            </circle>
          ))}
          {marks.map((mark, i) => {
            // Labels sit on alternate sides of their line, and turn inwards near an edge so none is cut off.
            const at = x(mark.value);
            const start = at < 96 || (i % 2 === 1 && at < width - 120);
            return (
              <g key={mark.label} className="mark">
                <line x1={at} x2={at} y1={14} y2={height - 18} />
                <text x={at} y={10} textAnchor={start ? 'start' : 'end'} dx={start ? 4 : -4}>
                  {mark.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {width !== null && rows.length > 0 && (
        <div className="rp-strips">
          {rows.map(row => (
            <div key={row.id} className="rp-strip-row">
              <div className="rp-row">
                <span className="name">{row.label}</span>
                <span className="rp-note">{row.detail}</span>
              </div>
              <svg width={width} height={20} role="img" aria-label={`${row.label}: ${row.detail}`}>
                <line className="grid" x1={inset} x2={inset + track} y1={10} y2={10} />
                {row.points.map(point => (
                  <circle key={point.id} cx={x(point.value)} cy={10} r={3} fill={point.color} opacity={0.55}>
                    <title>{point.title}</title>
                  </circle>
                ))}
                {row.mark !== undefined && <line className="median" x1={x(row.mark)} x2={x(row.mark)} y1={2} y2={18} />}
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
