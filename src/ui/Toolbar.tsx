import type {ComponentProps, ReactNode} from 'react';
import {ControlSizeContext} from './controlSize';
import {cx} from './cx';

export function Toolbar({page, className, children, ...props}: ComponentProps<'div'> & {page?: boolean; children?: ReactNode}) {
  const row = (
    <div {...props} className={cx('rp-toolbar', className)} data-page-toolbar={page || undefined}>
      {children}
    </div>
  );
  return page ? <ControlSizeContext value="L">{row}</ControlSizeContext> : row;
}
