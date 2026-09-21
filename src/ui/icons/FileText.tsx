// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function FileText({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="m16.34 5.296-3.62-3.622c-.42-.42-1-.66-1.591-.66H5.25C4.01 1.015 3 2.025 3 3.265v12.484c0 1.24 1.01 2.25 2.25 2.25h9.5c1.24 0 2.25-1.01 2.25-2.25V6.887c0-.6-.234-1.166-.66-1.591m-1.06 1.06c.046.047.074.104.106.159H12.25c-.413 0-.75-.337-.75-.75V2.628c.055.033.114.06.16.106zm-.53 10.142h-9.5c-.413 0-.75-.337-.75-.75V3.265c0-.413.337-.75.75-.75H10v3.25c0 1.24 1.01 2.25 2.25 2.25h3.25v7.733c0 .413-.337.75-.75.75"
      />
      <path
        fill="currentColor"
        d="M13 11.498H7c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h6c.414 0 .75.336.75.75s-.336.75-.75.75M13 14.498H7c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h6c.414 0 .75.336.75.75s-.336.75-.75.75"
      />
    </svg>
  );
}
