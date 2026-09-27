import {cx} from './cx';
import {TextTooltip} from './Button';
import {ContextualHelp, type Help} from './ContextualHelp';

// A label and its value, as a pair or, with more, an object: `full` is the full value, shown as a tooltip, and `help`
// explains the label or the value in a help popover beside the label. `row` keeps label and value on one line.
export type KvItem = [label: string, value: string] | {label: string; value: string; full?: string; help?: Help};
export function Kv({items, inline, row}: {items: KvItem[]; inline?: boolean; row?: boolean}) {
  return (
    <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row')}>
      {items.map(item => {
        const {label: k, value: v, full, help} = Array.isArray(item) ? {label: item[0], value: item[1]} : item;
        return (
          <div key={k}>
            <span className="k">
              {help ? (
                <span className="rp-help-row">
                  {k}
                  <ContextualHelp {...help} />
                </span>
              ) : (
                k
              )}
            </span>
            {full ? (
              <TextTooltip className="v" text={full}>
                {v}
              </TextTooltip>
            ) : (
              <span className="v">{v}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
