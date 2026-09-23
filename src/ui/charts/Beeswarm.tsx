import {useT} from '../../i18n';
import {useChartDescription} from './description';
import {useMemo} from 'react';
import {useContentWidth} from '../hooks';
import {ChartTip, useChartTip} from './tip';
import {logDomain, logPosition, logTicks, swarm} from './layout';

// `lines` is what the hover tip shows for the point, first line in bold.
export type SwarmPoint = {id: string; value: number; color: string; lines: string[]};
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
  maxHeight = 160
}: {
  label: string;
  points: SwarmPoint[];
  marks?: SwarmMark[];
  rows?: SwarmRow[];
  fmt: (value: number) => string;
  // The band's maximum height.
  maxHeight?: number;
}) {
  const t = useT();
  const describedBy = useChartDescription();
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const domain = useMemo(() => logDomain(points.map(point => point.value)), [points]);
  const ticks = useMemo(() => logTicks(domain, width && width < 480 ? 4 : 8), [domain, width]);
  const track = Math.max((width ?? 0) - inset * 2, 1);
  const x = (value: number) => inset + logPosition(value, domain) * track;
  // Dense samples get smaller dots so a thousand lookups still fit the band.
  const radius = points.length > 400 ? 2 : points.length > 120 ? 3 : 4;
  const {ys, hidden} = useMemo(
    () =>
      width
        ? swarm(
            points.map(point => inset + logPosition(point.value, domain) * track),
            radius,
            (maxHeight - 36) / 2
          )
        : {ys: [], hidden: []},
    [points, domain, track, radius, maxHeight, width]
  );
  // The band is as tall as the dots stack; a few samples get a low chart, not empty space.
  const band = Math.max(24, 2 * (Math.max(0, ...ys.map(y => Math.abs(y ?? 0))) + radius + 2));
  const height = band + 36;
  return (
    <div className="rp-swarm" ref={ref}>
      <div className="rp-chart-hover" ref={tipRef} onPointerLeave={hideTip}>
        {width !== null && (
          <svg width={width} height={height} role="img" aria-label={label} aria-describedby={describedBy}>
            {ticks.map(tick => {
              // A label on the track's last stop ends at the chart's edge instead of running past it.
              const last = x(tick) >= width - inset - 1;
              return (
                <g key={tick}>
                  <line className="grid" x1={x(tick)} x2={x(tick)} y1={16} y2={height - 18} />
                  <text className="tick" x={last ? width : x(tick)} y={height - 4} textAnchor={last ? 'end' : 'middle'}>
                    {fmt(tick)}
                  </text>
                </g>
              );
            })}
            {points.map((point, i) =>
              ys[i] === null || ys[i] === undefined ? null : (
                <circle
                  key={point.id}
                  cx={x(point.value)}
                  cy={16 + band / 2 + ys[i]}
                  r={radius}
                  fill={point.color}
                  onPointerMove={event => showTip(event, point.lines)}
                />
              )
            )}
            {/* Dots with no room left in their column are counted where they would stand, not piled on others. */}
            {hidden.map(group => (
              <text key={group.x} className="more" x={group.x} y={12} textAnchor="middle">
                +{group.count}
              </text>
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
                <svg width={width} height={20} role="img" aria-label={t('ui.valuePair', {label: row.label, value: row.detail})}>
                  <line className="grid" x1={inset} x2={inset + track} y1={10} y2={10} />
                  {row.points.map(point => (
                    <circle key={point.id} cx={x(point.value)} cy={10} r={4} fill={point.color} onPointerMove={event => showTip(event, point.lines)} />
                  ))}
                  {row.mark !== undefined && <line className="median" x1={x(row.mark)} x2={x(row.mark)} y1={-2} y2={22} />}
                </svg>
              </div>
            ))}
          </div>
        )}
        <ChartTip tip={tipState} />
      </div>
    </div>
  );
}
