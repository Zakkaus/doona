import type {ComponentProps, ReactNode} from 'react';
import {cx} from './cx';

export function Toolbar({page, className, children, ...props}: ComponentProps<'div'> & {page?: boolean; children?: ReactNode}) {
  return (
    <div {...props} className={cx('rp-toolbar', className)} data-page-toolbar={page || undefined}>
      {children}
    </div>
  );
}
