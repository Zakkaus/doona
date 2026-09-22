import type {ReactNode} from 'react';
import {cx} from './cx';

// One item of a set, as S2's Tag: a label with an optional trailing action (remove, undo). Built on plain markup
// rather than a react-aria TagGroup so a page that shows a few tags does not pull a collection into the shell.
export function Tag({children, tone, action}: {children: ReactNode; tone?: 'new' | 'removed'; action?: ReactNode}) {
  return (
    <span className={cx('rp-tag', tone)}>
      <span className="rp-tag-label">{children}</span>
      {action}
    </span>
  );
}

export function Tags({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="rp-tags" role="group" aria-label={label}>
      {children}
    </div>
  );
}
