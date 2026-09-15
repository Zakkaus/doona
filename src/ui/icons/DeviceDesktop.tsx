// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function DeviceDesktop({className, ...props}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={className ? 'rp-icon ' + className : 'rp-icon'}
      {...props}
    >
      <path
        fill="currentColor"
        d="M14 18.5H6c-.414 0-.75-.336-.75-.75S5.586 17 6 17h8c.414 0 .75.336.75.75s-.336.75-.75.75M16.75 16H3.25C2.01 16 1 14.99 1 13.75v-8.5C1 4.01 2.01 3 3.25 3h13.5C17.99 3 19 4.01 19 5.25v8.5c0 1.24-1.01 2.25-2.25 2.25M3.25 4.5c-.413 0-.75.337-.75.75v8.5c0 .413.337.75.75.75h13.5c.413 0 .75-.337.75-.75v-8.5c0-.413-.337-.75-.75-.75z"
      />
    </svg>
  );
}
