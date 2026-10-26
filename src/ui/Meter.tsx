import type {ReactNode} from 'react';
import {Label, Meter as RMeter} from 'react-aria-components';
import {cx} from './cx';
import {TextTooltip} from './Tooltip';

export function Bar({label, value, pct, color}: {label: ReactNode; value: string; pct: number; color: string}) {
  return (
    <div className="rp-bar">
      <div className="top">
        <span className="l">{typeof label === 'string' ? <TextTooltip>{label}</TextTooltip> : label}</span>
        <span className="v">{value}</span>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} />
      </div>
    </div>
  );
}

// S2's Meter: a quantity within a known range, such as space used against a limit, with its label and value above the
// track. The value's text is also what assistive technology reads. `tone` colours the fill as the light's tones do: ok
// is S2's informative accent, warn its notice and err its negative variant. M is the default; S, for a small card, takes
// S2's small field label (12px, subdued) and its 4px track.
export function Meter({
  label,
  value,
  valueLabel,
  tone = 'ok',
  size
}: {
  label: string;
  value: number;
  valueLabel: string;
  tone?: 'ok' | 'warn' | 'err';
  size?: 'S' | 'M';
}) {
  return (
    <RMeter className={cx('rp-meter', tone)} data-size={size === 'S' ? 'S' : undefined} value={value} valueLabel={valueLabel}>
      {({percentage}) => (
        <>
          <span className="top">
            <Label className="l">{label}</Label>
            <span className="v">{valueLabel}</span>
          </span>
          <MeterTrack percentage={percentage} />
        </>
      )}
    </RMeter>
  );
}
// A meter's track filled to `percentage`, for a meter that lays out its own label and value, such as a fact's.
export function MeterTrack({percentage}: {percentage: number}) {
  return (
    <span className="track">
      <span className="fill" style={{width: `${percentage}%`}} />
    </span>
  );
}
