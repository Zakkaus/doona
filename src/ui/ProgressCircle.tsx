import {ProgressBar} from 'react-aria-components';

// S2's ProgressCircle, indeterminate: a wait of unknown length. S (16px) sits beside text, M (32px) stands alone. Its
// arc and track follow S2's geometry: a 2px stroke at S, 3px at M, the arc turning once a second as it grows and shrinks.
export function ProgressCircle({size = 'M', ...label}: {size?: 'S' | 'M'} & ({'aria-label': string} | {'aria-labelledby': string})) {
  // The view box is the circle's size in pixels, so the radius leaves half the stroke inside it.
  const box = size === 'S' ? 16 : 32;
  const c = box / 2;
  const r = c - (size === 'S' ? 1 : 1.5);
  return (
    <ProgressBar {...label} isIndeterminate className="rp-progress-circle" data-size={size}>
      <svg fill="none" width="100%" height="100%" viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} className="track" />
        <circle cx={c} cy={c} r={r} className="fill" pathLength={100} strokeDasharray="100 200" strokeLinecap="round" />
      </svg>
    </ProgressBar>
  );
}
