import {Label, Meter as RMeter} from 'react-aria-components';
import {NodeName} from './NodeName';
import {useId, type ReactNode} from 'react';
import {cx} from './cx';
import {TextTooltip} from './Tooltip';
import {HelpRow, type Help} from './ContextualHelp';
import {MeterTrack} from './Meter';

// A label and its value, as a pair or, with more, an object: `full` is the full value, shown as a tooltip, and `help`
// explains the label or the value in a help popover beside the label. `row` keeps label and value on one line.
// `wide` gives the fact a row of its own; `fit` lets a card's fact take the width its value needs, a row of its own when it
// is wider than half the card. `meter` makes the fact an S2 Meter: the label names it, the value is its value
// text, and its small track, toned as Meter's, runs under the value. `detail` lists a detail panel's fields as a
// definition list under an optional `title`: a field a line, the labels in one column and each value beside its label.
export type KvItem<T = string> =
  | [label: string, value: T]
  | {
      label: string;
      value: T;
      full?: string;
      help?: Help;
      nodeName?: boolean;
      wide?: boolean;
      fit?: boolean;
      meter?: {value: number; tone?: 'ok' | 'warn' | 'err'};
    };
export function Kv({
  items,
  inline,
  row,
  compact,
  detail,
  title
}: {
  items: KvItem<ReactNode>[];
  inline?: boolean;
  row?: boolean;
  compact?: boolean;
  detail?: boolean;
  title?: string;
}) {
  const id = useId();
  const [Pair, Key, Value] = detail ? (['div', 'dt', 'dd'] as const) : (['div', 'span', 'span'] as const);
  const pairs = items.map(item => {
    const {label: k, value: v, full, help, nodeName, wide, fit, meter} = Array.isArray(item) ? {label: item[0], value: item[1]} : item;
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
    const shown = nodeName && typeof v === 'string' ? <NodeName name={v} /> : v;
    return (
      <Pair key={k} className={wide ? 'wide' : fit ? 'fit' : undefined}>
        <Key className="k">{help ? <HelpRow help={help}>{k}</HelpRow> : k}</Key>
        {full && detail ? (
          <Value className="v">
            <TextTooltip text={full}>{v}</TextTooltip>
          </Value>
        ) : full ? (
          <TextTooltip className="v" text={full}>
            {v}
          </TextTooltip>
        ) : (
          <Value className="v">{shown}</Value>
        )}
      </Pair>
    );
  });
  if (detail)
    return (
      <section className="rp-kv-section" aria-labelledby={title ? id : undefined}>
        {title && (
          <h3 id={id} className="rp-kv-title">
            {title}
          </h3>
        )}
        <dl className="rp-kv detail">{pairs}</dl>
      </section>
    );
  return <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row', compact && 'compact')}>{pairs}</div>;
}

// Detail sections stacked in one panel: their labels share one column, so every value starts at the same edge.
export function KvSections({children}: {children: ReactNode}) {
  return <div className="rp-kv-sections">{children}</div>;
}
