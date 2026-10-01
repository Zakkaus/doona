import {createContext, useContext} from 'react';
import {TextTooltip} from './Button';
import {cx} from './cx';

export const CountryFlagsContext = createContext<((name: string) => string | null) | null>(null);

export function NodeName({name, cut, className, text}: {name: string; cut?: 'start'; className?: string; text?: string}) {
  const lookup = useContext(CountryFlagsContext);
  const flag = lookup?.(name);
  return (
    <TextTooltip cut={cut} className={cx('rp-node-name', className)} text={text} tooltipText={name}>
      {flag && <span className="rp-node-flag" data-flag={flag} aria-hidden="true" />}
      {name}
    </TextTooltip>
  );
}
