// Three dots on the Spectrum 20px grid, matching the other icons' size and fill.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function More({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M3.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"
      />
    </svg>
  );
}
