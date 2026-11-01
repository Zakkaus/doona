import {createContext, useContext, useEffect, useId, useState, type ReactNode} from 'react';
import {useT} from '../i18n';
import {cx} from './cx';
import {ProgressCircle} from './ProgressCircle';
import {joinWait, overdue} from './waitClock';

export function Empty({role, children}: {role?: 'alert'; children: ReactNode}) {
  return (
    <div className="rp-empty" role={role}>
      {children}
    </div>
  );
}

// Holds a chart's or a card body's height while its data arrives or when there is none, so the card does not jump;
// `holds` names the body it stands in for, which sets the height (see cards-dashboard.css).
export function ChartWait({holds, children}: {holds?: 'tall' | 'bars' | 'form' | 'swarm'; children: ReactNode}) {
  return <div className={cx('rp-chart-wait', holds)}>{children}</div>;
}

// The route whose wait a loading state belongs to, which the shell provides around a page: startup, the page's code and
// its first reads of one route share a clock (waitClock.ts). A state outside it, as a widget's, waits on its own.
export const WaitScope = createContext<string | undefined>(undefined);

// A loading state holds its box at once and shows after 150ms, so a fast load does not flash it. The delay belongs to
// the wait, not to a mounted state: a Skeleton that mounts while an earlier one of the same route is showing, or just
// went, shows at once, so a change of phase never blanks the page again. `waiting` false takes no part, and a state
// that waits again starts a new delay.
export function useWaitAttr(waiting = true) {
  const own = useId();
  const key = useContext(WaitScope) ?? own;
  const wait = waiting ? key : null;
  const [visible, setVisible] = useState(() => wait !== null && overdue(wait));
  const [was, setWas] = useState(wait);
  if (was !== wait) {
    setWas(wait);
    setVisible(wait !== null && overdue(wait));
  }
  useEffect(() => (wait === null ? undefined : joinWait(wait, () => setVisible(true))), [wait]);
  return visible ? undefined : '';
}

export function Loading({children}: {children?: ReactNode}) {
  const t = useT();
  const wait = useWaitAttr();
  const id = useId();
  return (
    <div className="rp-empty" role="status" data-wait={wait}>
      <ProgressCircle size="S" aria-labelledby={id} />
      <span id={id}>{children ?? t('ui.loading')}</span>
    </div>
  );
}
