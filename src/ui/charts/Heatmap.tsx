import {useChartDescription} from './description';
import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {heatTone} from './layout';
import {ChartTip, useChartTip} from './tip';

type HeatRow = {id: string; label: ReactNode; color: string; counts: number[]; titles: string[]};

// Rows by category, columns by time: a cell's tone says how busy that row was then, against the row's own busiest
// moment, so three errors stand out beside a thousand info records; its title gives the count in words.
export function Heatmap({label, rows, columns}: {label: string; rows: HeatRow[]; columns: string[]}) {
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  // Three marks keep 16px between them; where a longer time, such as one with AM or PM, leaves less, the middle mark
  // gives way, and every cell's title still tells its time.
  const ends = useRef<HTMLDivElement>(null);
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    const element = ends.current;
    if (!element) return;
    const measure = () => {
      const [first, middle, last] = [...element.children].map(mark => mark.getBoundingClientRect());
      setCrowded(last !== undefined && (middle!.left - first!.right < 16 || last.left - middle!.right < 16));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [columns]);
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
      {rows.map(row => {
        const peak = Math.max(...row.counts);
        return (
          <div key={row.id} className="row">
            <div className="head">{row.label}</div>
            <div className="cells">
              {row.counts.map((count, i) => (
                <span
                  key={i}
                  className={'cell t' + heatTone(count, peak)}
                  style={{['--tone' as string]: row.color}}
                  onPointerMove={event => showTip(event, [row.titles[i]])}
                  role="img"
                  aria-label={row.titles[i]}
                />
              ))}
            </div>
          </div>
        );
      })}
      {columns.length > 0 && (
        <div className="row times" aria-hidden="true">
          <div className="head" />
          <div className="ends" ref={ends}>
            <span>{columns[0]}</span>
            {columns.length > 2 && <span className={crowded ? 'gone' : undefined}>{columns[Math.floor(columns.length / 2)]}</span>}
            {columns.length > 1 && <span>{columns[columns.length - 1]}</span>}
          </div>
        </div>
      )}
      <ChartTip tip={tipState} />
    </div>
  );
}
