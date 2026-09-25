import {useLayoutEffect, useState} from 'react';
import {arc, pie} from 'd3-shape';
import {useT} from '../../i18n';
import {useContentSize} from '../hooks';
import {ChartTip, useChartTip} from './tip';
import {useSelection} from './interaction';

export function DonutPlot({label, rows}: {label: string; rows: Array<{name: string; value: number | null; text: string; color: string}>}) {
  const t = useT();
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round, 120);
  const {tip, showAt, hide} = useChartTip();
  const [selected, setSelected] = useState<number | null>(null);
  const data = rows.filter((row): row is typeof row & {value: number} => row.value !== null && row.value > 0);
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const minimum = data.some(row => (row.value / total) * 360 < 6) ? 6 : 0;
  // Preserve Recharts' minimum angle for every nonzero slice, without sorting the legend order.
  const sectors = pie<(typeof data)[number]>()
    .sort(null)
    .value(row => minimum + (row.value / total) * (360 - data.length * minimum))(data);
  const ring = arc<(typeof sectors)[number]>().innerRadius(44).outerRadius(56).digits(3);
  const select = (index: number) => setSelected(index);
  const clear = () => {
    setSelected(null);
    hide();
  };
  useLayoutEffect(() => {
    const sector = selected === null ? undefined : sectors[selected];
    if (!sector || selected === null) {
      hide();
      return;
    }
    const row = data[selected];
    const [tx, ty] = ring.centroid(sector);
    showAt({
      x: Math.round((width / 2 + tx) * 10000) / 10000,
      y: Math.round((height / 2 + ty) * 10000) / 10000,
      width,
      bounds: {x: 0, y: 0, width, height},
      lines: [`${row.name}${t('ui.labelSeparator')}${t('ui.share', {bytes: row.text, percent: String(row.value)})}`]
    });
  });
  const selection = useSelection(data.length, select, clear);
  return (
    <div ref={ref} style={{height: '100%', width: '100%', position: 'relative'}} onPointerLeave={selection.onPointerLeave}>
      <ChartTip tip={tip} />
      {size && (
        <svg
          className="rp-activity-surface"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{display: 'block'}}
          role="application"
          aria-label={label}
          tabIndex={0}
          onFocus={selection.onFocus}
          onBlur={selection.onBlur}
          onKeyDown={selection.onKeyDown}
        >
          <g tabIndex={0} transform={`translate(${width / 2},${height / 2})`}>
            {sectors.map((sector, index) => (
              <path
                key={data[index].name}
                d={ring({...sector, endAngle: Math.min(sector.endAngle, sector.startAngle + (359.999 * Math.PI) / 180)}) ?? undefined}
                fill={data[index].color}
                stroke="none"
                onPointerEnter={() => select(index)}
                onPointerLeave={selection.onPointerLeave}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
