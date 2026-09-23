import {useChartDescription} from './description';
import {ChartTip, useChartTip} from './tip';

export type BarItem = {id: string; label: string; count: number; text: string};

// A ranked list: each row its label, a bar against the largest, and its count, so the top of the list reads first.
export function BarList({label, items, color, rest}: {label: string; items: BarItem[]; color: string; rest?: string}) {
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const max = Math.max(1, ...items.map(item => item.count));
  return (
    <div className="rp-barlist rp-chart-hover" ref={tipRef} onPointerLeave={hideTip} role="group" aria-label={label} aria-describedby={describedBy}>
      <ol>
        {items.map(item => (
          <li key={item.id} aria-label={`${item.label}: ${item.text}`} onPointerMove={event => showTip(event, [item.label, item.text])}>
            <span className="name">{item.label}</span>
            <span className="bar" aria-hidden="true">
              <i style={{width: `${(item.count / max) * 100}%`, background: color}} />
            </span>
            <span className="value">{item.text}</span>
          </li>
        ))}
      </ol>
      {rest && <p className="rp-note">{rest}</p>}
      <ChartTip tip={tipState} />
    </div>
  );
}
