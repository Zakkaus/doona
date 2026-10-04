import {Label, Meter as RMeter} from 'react-aria-components';
import {NodeName} from './NodeName';
import type {ReactNode} from 'react';
import {cx} from './cx';
import {TextTooltip} from './Tooltip';
import {HelpRow, type Help} from './ContextualHelp';
import {MeterTrack} from './Feedback';

// A label and its value, as a pair or, with more, an object: `full` is the full value, shown as a tooltip, and `help`
// explains the label or the value in a help popover beside the label. `row` keeps label and value on one line.
// `wide` gives the fact a row of its own. `meter` makes the fact an S2 Meter: the label names it, the value is its value
// text, and its small track, toned as Meter's, runs under the value.
export type KvItem<T = string> =
  | [label: string, value: T]
  | {label: string; value: T; full?: string; help?: Help; nodeName?: boolean; wide?: boolean; meter?: {value: number; tone?: 'ok' | 'warn' | 'err'}};
export function Kv({items, inline, row, compact}: {items: KvItem<ReactNode>[]; inline?: boolean; row?: boolean; compact?: boolean}) {
  return (
    <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row', compact && 'compact')}>
      {items.map(item => {
        const {label: k, value: v, full, help, nodeName, wide, meter} = Array.isArray(item) ? {label: item[0], value: item[1]} : item;
        if (meter)
          return (
            <RMeter key={k} className={cx('rp-kv-meter', meter.tone ?? 'ok', wide && 'wide')} value={meter.value} valueLabel={typeof v === 'string' ? v : full}>
              {({percentage}) => (
                <>
                  <Label className="k">{k}</Label>
                  <span className="v">{v}</span>
                  <MeterTrack percentage={percentage} />
                </>
              )}
            </RMeter>
          );
        return (
          <div key={k} className={wide ? 'wide' : undefined}>
            <span className="k">{help ? <HelpRow help={help}>{k}</HelpRow> : k}</span>
            {full ? (
              <TextTooltip className="v" text={full}>
                {v}
              </TextTooltip>
            ) : (
              <span className="v">{nodeName && typeof v === 'string' ? <NodeName name={v} /> : v}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
