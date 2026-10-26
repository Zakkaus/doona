import type {ReactNode} from 'react';
import {cx} from './cx';
import {TextTooltip} from './Tooltip';

// Without children the light is the dot alone, for a place that names the state elsewhere.
export function Light({tone, children, small}: {tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'muted'; children?: ReactNode; small?: boolean}) {
  return <span className={cx('rp-light', tone, small && 'sm')}>{children != null && <span>{children}</span>}</span>;
}
export function Badge({children, tone, className, tip}: {children: ReactNode; tone?: 'warn' | 'negative'; className?: string; tip?: string}) {
  return (
    <TextTooltip className={cx('rp-badge', tone, className)} text={tip}>
      {children}
    </TextTooltip>
  );
}
