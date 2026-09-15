// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function Add({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M16.25 9.25h-5.5v-5.5c0-.414-.336-.75-.75-.75s-.75.336-.75.75v5.5h-5.5c-.414 0-.75.336-.75.75s.336.75.75.75h5.5v5.5c0 .414.336.75.75.75s.75-.336.75-.75v-5.5h5.5c.414 0 .75-.336.75-.75s-.336-.75-.75-.75"
      />
    </svg>
  );
}
