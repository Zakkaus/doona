// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function Contrast({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M10 18.78c-4.825 0-8.75-3.926-8.75-8.75S5.175 1.28 10 1.28s8.75 3.924 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.251-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.253 7.25-7.25S13.998 2.78 10 2.78"
      />
      <path
        fill="currentColor"
        d="M10 14.384c0 .653.615 1.121 1.251.973 2.435-.566 4.249-2.75 4.249-5.357s-1.814-4.79-4.249-5.357c-.636-.148-1.251.32-1.251.973z"
      />
    </svg>
  );
}
