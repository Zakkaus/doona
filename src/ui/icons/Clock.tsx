// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function Clock({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"
      />
      <path
        fill="currentColor"
        d="M13.249 12.645c-.129 0-.26-.034-.379-.104l-3.22-1.895c-.23-.134-.37-.38-.37-.646V5c0-.414.335-.75.75-.75s.75.336.75.75v4.571l2.85 1.677c.357.21.476.67.266 1.026-.14.239-.39.37-.647.37"
      />
    </svg>
  );
}
