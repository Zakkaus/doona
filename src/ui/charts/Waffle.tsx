import {useT} from '../../i18n';
import {shareDescription, useChartDescription} from './description';
import {useMemo} from 'react';
import {waffleCells} from './layout';
import {ChartTip, useChartTip} from './tip';

export type WaffleShare = {id: string; label: string; count: number; color: string; text: string};

// A hundred cells split by share: proportions read by eye, with the counts in the legend beside or under them.
export function Waffle({label, shares, legendLimit}: {label: string; shares: WaffleShare[]; legendLimit?: number}) {
  const t = useT();
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const cells = useMemo(() => {
    const counts = waffleCells(shares.map(share => share.count));
    return shares.flatMap((share, i) => Array.from({length: counts[i]}, () => share));
  }, [shares]);
  return (
    <div className="rp-waffle rp-chart-hover" ref={tipRef} onPointerLeave={hideTip}>
      <div className="body">
        <div className="grid" role="img" aria-describedby={describedBy} aria-label={shareDescription(label, shares, t)}>
          {cells.map((share, i) => (
            <span key={i} style={{background: share.color}} onPointerMove={event => showTip(event, [share.label, share.text])} />
          ))}
        </div>
        <ul className="legend">
          {shares.slice(0, legendLimit).map(share => (
            <li key={share.id}>
              <i className="sw" style={{background: share.color}} />
              <span>{share.label}</span>
              <b>{share.text}</b>
            </li>
          ))}
        </ul>
      </div>
      <ChartTip tip={tipState} />
    </div>
  );
}
