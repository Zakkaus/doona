// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function ListBulleted({className, ...props}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={cx('rp-icon', className)}
      {...props}
    >
      <path
        fill="currentColor"
        d="M17.25 16.521h-10c-.414 0-.75-.335-.75-.75s.336-.75.75-.75h10c.414 0 .75.336.75.75s-.336.75-.75.75M17.25 10.521h-10c-.414 0-.75-.335-.75-.75s.336-.75.75-.75h10c.414 0 .75.336.75.75s-.336.75-.75.75M17.25 4.521h-10c-.414 0-.75-.335-.75-.75s.336-.75.75-.75h10c.414 0 .75.336.75.75s-.336.75-.75.75"
      />
      <circle cx="3.5" cy="3.771" r="1.5" fill="currentColor" />
      <circle cx="3.5" cy="9.771" r="1.5" fill="currentColor" />
      <circle cx="3.5" cy="15.771" r="1.5" fill="currentColor" />
    </svg>
  );
}
