// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function TextAlignLeft({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M16.25 4.5H3.75c-.414 0-.75-.336-.75-.75S3.336 3 3.75 3h12.5c.414 0 .75.336.75.75s-.336.75-.75.75M13.75 8.5h-10c-.414 0-.75-.336-.75-.75S3.336 7 3.75 7h10c.414 0 .75.336.75.75s-.336.75-.75.75M16.25 12.5H3.75c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h12.5c.414 0 .75.336.75.75s-.336.75-.75.75M13.75 16.5h-10c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h10c.414 0 .75.336.75.75s-.336.75-.75.75"
      />
    </svg>
  );
}
