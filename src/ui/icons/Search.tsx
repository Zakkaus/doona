// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function Search({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="m18.53 17.47-5.083-5.084C14.417 11.186 15 9.66 15 8c0-3.86-3.14-7-7-7S1 4.14 1 8s3.14 7 7 7c1.66 0 3.185-.584 4.386-1.553l5.084 5.083c.146.147.338.22.53.22s.384-.073.53-.22c.293-.293.293-.767 0-1.06M8 13.5c-3.032 0-5.5-2.468-5.5-5.5S4.968 2.5 8 2.5s5.5 2.468 5.5 5.5-2.468 5.5-5.5 5.5"
      />
    </svg>
  );
}
