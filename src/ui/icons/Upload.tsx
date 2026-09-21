// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function Upload({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="m13.527 10.491-3.002-2.998c-.293-.293-.767-.293-1.06 0l-2.998 2.998c-.293.293-.293.768 0 1.06.147.147.339.22.53.22s.384-.073.53-.22L9.25 9.83v8.18c0 .414.336.75.75.75s.75-.336.75-.75V9.837l1.718 1.715c.293.293.767.293 1.06 0s.293-.769 0-1.06"
      />
      <path
        fill="currentColor"
        d="M15.75 17h-2.799c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h2.799c.414 0 .75-.337.75-.75V4.25c0-.413-.336-.75-.75-.75H4.25c-.414 0-.75.337-.75.75v10.5c0 .413.336.75.75.75h2.726c.414 0 .75.336.75.75s-.336.75-.75.75H4.25C3.01 17 2 15.99 2 14.75V4.25C2 3.01 3.01 2 4.25 2h11.5C16.99 2 18 3.01 18 4.25v10.5c0 1.24-1.01 2.25-2.25 2.25"
      />
    </svg>
  );
}
