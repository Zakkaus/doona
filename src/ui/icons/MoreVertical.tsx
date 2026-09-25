// Drawn for doona, not an Adobe icon: three stacked dots on the Spectrum 20px grid for the overflow menu of a top bar.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function MoreVertical({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M10 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"
      />
    </svg>
  );
}
