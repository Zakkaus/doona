import {useContentWidth} from '../hooks';
import {symlogPosition, thousandTicks} from './layout';

export type ScatterPoint = {id: string; x: number; y: number; name: string; detail: string};
export type ScatterSeries = {id: string; label: string; color: string; points: ScatterPoint[]};

const left = 64;
const bottom = 22;
const top = 8;
const right = 12;

// Two quantities that span many orders of magnitude, such as bytes, on symmetric log axes so zero still has a
// place. Clicking a point selects it; the table the chart sits above is the keyboard path to the same rows.
export function Scatter({
  label,
  series,
  fmt,
  onSelect,
  height = 260
}: {
  label: string;
  series: ScatterSeries[];
  fmt: (value: number) => string;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const max = Math.max(1, ...series.flatMap(s => s.points.flatMap(point => [point.x, point.y])));
  const ticks = thousandTicks(max);
  const end = ticks[ticks.length - 1];
  const plotWidth = Math.max((width ?? 0) - left - right, 1);
  const plotHeight = height - top - bottom;
  const x = (value: number) => left + symlogPosition(value, end) * plotWidth;
  const y = (value: number) => top + (1 - symlogPosition(value, end)) * plotHeight;
  return (
    <div className="rp-scatter" ref={ref}>
      {width !== null && (
        <svg width={width} height={height} role="img" aria-label={label}>
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
          {series.flatMap(s =>
            s.points.map(point => (
              <circle
                key={point.id}
                className={onSelect ? 'pick' : undefined}
                cx={x(point.x)}
                cy={y(point.y)}
                r={5}
                fill={s.color}
                onClick={onSelect ? () => onSelect(point.id) : undefined}
              >
                <title>{`${point.name}: ${point.detail}`}</title>
              </circle>
            ))
          )}
        </svg>
      )}
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
