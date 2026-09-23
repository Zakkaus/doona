import {useChartDescription} from './description';
import {useMemo} from 'react';
import {waffleCells} from './layout';
import {ChartTip, useChartTip} from './tip';

export type WaffleShare = {id: string; label: string; count: number; color: string; text: string};

// A hundred cells split by share: proportions read by eye, with the counts in the legend beside them.
export function Waffle({label, shares}: {label: string; shares: WaffleShare[]}) {
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const cells = useMemo(() => {
    const counts = waffleCells(shares.map(share => share.count));
    return shares.flatMap((share, i) => Array.from({length: counts[i]}, () => share));
  }, [shares]);
  return (
    <div className="rp-waffle rp-chart-hover" ref={tipRef} onPointerLeave={hideTip}>
      <div
        className="grid"
        role="img"
        aria-describedby={describedBy}
        aria-label={`${label}: ${shares.map(share => `${share.label} ${share.text}`).join(', ')}`}
      >
        {cells.map((share, i) => (
          <span key={i} style={{background: share.color}} onPointerMove={event => showTip(event, [share.label, share.text])} />
        ))}
      </div>
      <ul className="legend">
        {shares.map(share => (
          <li key={share.id}>
            <i className="sw" style={{background: share.color}} />
            <span>{share.label}</span>
            <b>{share.text}</b>
          </li>
        ))}
      </ul>
      <ChartTip tip={tipState} />
    </div>
  );
}
