import type {ReactNode} from 'react';
import {heatTone} from './layout';

export type HeatRow = {id: string; label: ReactNode; color: string; counts: number[]; titles: string[]};

// Rows by category, columns by time: a cell's tone says how busy it was, its title says so in words.
export function Heatmap({label, rows, columns}: {label: string; rows: HeatRow[]; columns: string[]}) {
  const max = Math.max(0, ...rows.flatMap(row => row.counts));
  return (
    <div className="rp-heatmap" role="group" aria-label={label} style={{['--cols' as string]: columns.length}}>
      {rows.map(row => (
        <div key={row.id} className="row">
          <div className="head">{row.label}</div>
          <div className="cells">
            {row.counts.map((count, i) => (
              <span
                key={i}
                className={'cell t' + heatTone(count, max)}
                style={{['--tone' as string]: row.color}}
                title={row.titles[i]}
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
    </div>
  );
}
