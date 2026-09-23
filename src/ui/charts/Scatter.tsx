import {useChartDescription} from './description';
import {useContentWidth} from '../hooks';
import {ChartTip, useChartTip} from './tip';
import {symlogAxis, symlogPosition} from './layout';

export type ScatterPoint = {id: string; x: number; y: number; name: string; detail: string};
export type ScatterSeries = {id: string; label: string; color: string; points: ScatterPoint[]};

const left = 64;
const bottom = 22;
const top = 8;
const right = 28;

// Two quantities that span many orders of magnitude, such as bytes, on symmetric log axes so zero still has a
// place. Clicking a point selects it; the table the chart sits above is the keyboard path to the same rows.
export function Scatter({
  label,
  series,
  fmt,
  onSelect,
  regions,
  height = 260
}: {
  label: string;
  series: ScatterSeries[];
  fmt: (value: number) => string;
  // The dashed line is where x equals y; these name the two sides of it (above: more y, below: more x).
  regions?: {above: string; below: string};
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const describedBy = useChartDescription();
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const max = Math.max(1, ...series.flatMap(s => s.points.flatMap(point => [point.x, point.y])));
  const {end, ticks} = symlogAxis(max);
  const plotWidth = Math.max((width ?? 0) - left - right, 1);
  const plotHeight = height - top - bottom;
  const x = (value: number) => left + symlogPosition(value, end) * plotWidth;
  const y = (value: number) => top + (1 - symlogPosition(value, end)) * plotHeight;
  return (
    <div className="rp-scatter" ref={ref}>
      <div className="rp-chart-hover" ref={tipRef} onPointerLeave={hideTip}>
        {width !== null && (
          <svg width={width} height={height} role="img" aria-label={label} aria-describedby={describedBy}>
            {ticks.map(tick => (
              <g key={tick}>
                <line className="grid" x1={x(tick)} x2={x(tick)} y1={top} y2={top + plotHeight} />
                <line className="grid" x1={left} x2={left + plotWidth} y1={y(tick)} y2={y(tick)} />
                <text className="tick" x={x(tick)} y={height - 6} textAnchor="middle">
                  {fmt(tick)}
                </text>
                <text className="tick" x={left - 8} y={y(tick) + 4} textAnchor="end">
                  {fmt(tick)}
                </text>
              </g>
            ))}
            {regions && (
              <g className="diagonal">
                <line x1={x(0)} y1={y(0)} x2={x(end)} y2={y(end)} />
                <text x={left + 8} y={top + 14}>
                  {regions.above}
                </text>
                <text x={left + plotWidth - 8} y={top + plotHeight - 8} textAnchor="end">
                  {regions.below}
                </text>
              </g>
            )}
            {series
              .flatMap(s => s.points.map(point => ({point, color: s.color})))
              .map(({point, color}, i, all) => {
                // Points at the same spot are set around it in a small ring, so each can still be clicked.
                const cx = x(point.x);
                const cy = y(point.y);
                const twins = all.filter(other => x(other.point.x) === cx && y(other.point.y) === cy);
                const nth = twins.findIndex(other => other.point.id === point.id);
                const angle = (2 * Math.PI * nth) / twins.length;
                const spread = twins.length > 1 ? 6 : 0;
                return (
                  <circle
                    key={point.id}
                    className={onSelect ? 'pick' : undefined}
                    cx={cx + spread * Math.cos(angle)}
                    cy={cy + spread * Math.sin(angle)}
                    r={5}
                    fill={color}
                    onClick={onSelect ? () => onSelect(point.id) : undefined}
                    onPointerMove={event => showTip(event, [point.name, point.detail])}
                  />
                );
              })}
          </svg>
        )}
        <ChartTip tip={tipState} />
      </div>
    </div>
  );
}

export function ScatterLegend({series}: {series: ScatterSeries[]}) {
  return (
    <div className="rp-legend">
      {series.map(s => (
        <span key={s.id} className="it">
          <i className="sw" style={{background: s.color}} />
          {s.label} <b>{s.points.length}</b>
        </span>
      ))}
    </div>
  );
}
