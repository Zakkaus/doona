import {useChartDescription} from './description';
import type {ReactNode} from 'react';
import {heatTone} from './layout';
import {ChartTip, useChartTip} from './tip';

export type HeatRow = {id: string; label: ReactNode; color: string; counts: number[]; titles: string[]};

// Rows by category, columns by time: a cell's tone says how busy that row was then, against the row's own busiest
// moment, so three errors stand out beside a thousand info records; its title gives the count in words.
export function Heatmap({label, rows, columns}: {label: string; rows: HeatRow[]; columns: string[]}) {
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  return (
    <div
      className="rp-heatmap rp-chart-hover"
      ref={tipRef}
      onPointerLeave={hideTip}
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      style={{['--cols' as string]: columns.length}}
    >
      {rows.map(row => (
        <div key={row.id} className="row">
          <div className="head">{row.label}</div>
          <div className="cells">
            {row.counts.map((count, i, counts) => (
              <span
                key={i}
                className={'cell t' + heatTone(count, Math.max(...counts))}
                style={{['--tone' as string]: row.color}}
                onPointerMove={event => showTip(event, [row.titles[i]])}
                role="img"
                aria-label={row.titles[i]}
              />
            ))}
          </div>
        </div>
      ))}
      {columns.length > 0 && (
        <div className="row times" aria-hidden="true">
          <div className="head" />
          <div className="ends">
            <span>{columns[0]}</span>
            {columns.length > 2 && <span>{columns[Math.floor(columns.length / 2)]}</span>}
            {columns.length > 1 && <span>{columns[columns.length - 1]}</span>}
          </div>
        </div>
      )}
      <ChartTip tip={tipState} />
    </div>
  );
}
