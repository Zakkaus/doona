// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function Share({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="m13.527 5.49-3.002-2.997c-.293-.292-.767-.293-1.06 0L6.467 5.491c-.293.293-.293.767 0 1.06.147.147.339.22.53.22s.384-.073.53-.22L9.25 4.83v8.181c0 .414.336.75.75.75s.75-.336.75-.75V4.837l1.718 1.715c.293.292.767.293 1.06-.001.293-.293.293-.768 0-1.06"
      />
      <path
        fill="currentColor"
        d="M15.75 18.021H4.25c-1.24 0-2.25-1.01-2.25-2.25v-5.75c0-.414.336-.75.75-.75s.75.336.75.75v5.75c0 .414.336.75.75.75h11.5c.414 0 .75-.336.75-.75v-5.75c0-.414.336-.75.75-.75s.75.336.75.75v5.75c0 1.24-1.01 2.25-2.25 2.25"
      />
    </svg>
  );
}
