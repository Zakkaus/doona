import {useMemo} from 'react';
import {waffleCells} from './layout';

export type WaffleShare = {id: string; label: string; count: number; color: string; text: string};

// A hundred cells split by share: proportions read by eye, with the counts in the legend beside them.
export function Waffle({label, shares}: {label: string; shares: WaffleShare[]}) {
  const cells = useMemo(() => {
    const counts = waffleCells(shares.map(share => share.count));
    return shares.flatMap((share, i) => Array.from({length: counts[i]}, () => share));
  }, [shares]);
  return (
    <div className="rp-waffle">
      <div className="grid" role="img" aria-label={`${label}: ${shares.map(share => `${share.label} ${share.text}`).join(', ')}`}>
        {cells.map((share, i) => (
          <span key={i} style={{background: share.color}} title={`${share.label}: ${share.text}`} />
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
    </div>
  );
}
