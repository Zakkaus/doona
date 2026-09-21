// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function Download({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M13.53 9.427c-.292-.292-.766-.294-1.06 0l-1.717 1.714V2.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v8.4L7.53 9.426c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06l2.998 2.998c.146.147.338.22.53.22.191 0 .384-.073.53-.22l3.002-2.998c.293-.292.293-.767 0-1.06"
      />
      <path
        fill="currentColor"
        d="M15.75 18H4.25C3.01 18 2 16.99 2 15.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 .413.337.75.75.75h11.5c.413 0 .75-.337.75-.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 1.24-1.01 2.25-2.25 2.25"
      />
    </svg>
  );
}
