import {cx} from './cx';
import {TextTooltip} from './Button';
import {ContextualHelp, type Help} from './ContextualHelp';

// `row` keeps label and value on one line; a third element is the full value, shown as a tooltip, and a fourth
// explains the label or the value in a help popover beside the label.
export type KvItem = [string, string] | [string, string, string | undefined] | [string, string, string | undefined, Help | undefined];
export function Kv({items, inline, row}: {items: KvItem[]; inline?: boolean; row?: boolean}) {
  return (
    <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row')}>
      {items.map(([k, v, full, help]) => (
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
      ))}
    </div>
  );
}
