import {NodeName} from './NodeName';
import type {ReactNode} from 'react';
import {cx} from './cx';
import {TextTooltip} from './Button';
import {HelpRow, type Help} from './ContextualHelp';

// A label and its value, as a pair or, with more, an object: `full` is the full value, shown as a tooltip, and `help`
// explains the label or the value in a help popover beside the label. `row` keeps label and value on one line.
export type KvItem<T = string> = [label: string, value: T] | {label: string; value: T; full?: string; help?: Help; nodeName?: boolean};
export function Kv({items, inline, row, compact}: {items: KvItem<ReactNode>[]; inline?: boolean; row?: boolean; compact?: boolean}) {
  return (
    <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row', compact && 'compact')}>
      {items.map(item => {
        const {label: k, value: v, full, help, nodeName} = Array.isArray(item) ? {label: item[0], value: item[1]} : item;
        return (
          <div key={k}>
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
