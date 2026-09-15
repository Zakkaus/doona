// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function DevicePhone({className, ...props}: SVGProps<SVGSVGElement>) {
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
      <circle cx="10" cy="15" r="1" fill="currentColor" />
      <path
        fill="currentColor"
        d="M13.75 19h-7.5C5.01 19 4 17.99 4 16.75V3.25C4 2.01 5.01 1 6.25 1h7.5C14.99 1 16 2.01 16 3.25v13.5c0 1.24-1.01 2.25-2.25 2.25M6.25 2.5c-.413 0-.75.337-.75.75v13.5c0 .413.337.75.75.75h7.5c.413 0 .75-.337.75-.75V3.25c0-.413-.337-.75-.75-.75z"
      />
    </svg>
  );
}
