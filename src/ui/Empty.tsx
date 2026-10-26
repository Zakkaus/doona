import {useEffect, useId, useState, type ReactNode} from 'react';
import {useT} from '../i18n';
import {cx} from './cx';
import {ProgressCircle} from './ProgressCircle';

export function Empty({role, children}: {role?: 'alert'; children: ReactNode}) {
  return (
    <div className="rp-empty" role={role}>
      {children}
    </div>
  );
}

// Holds a chart's or a card body's height while its data arrives or when there is none, so the card does not jump;
// `holds` names the body it stands in for, which sets the height (see cards-dashboard.css).
export function ChartWait({holds, children}: {holds?: 'tall' | 'bars' | 'form'; children: ReactNode}) {
  return <div className={cx('rp-chart-wait', holds)}>{children}</div>;
}

// A loading state holds its box at once and shows after 150ms, so a fast load does not flash it.
export function useWaitAttr() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
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
