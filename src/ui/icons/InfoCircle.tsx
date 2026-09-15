// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function InfoCircle({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M10 5.26c.231-.008.456.074.627.229.33.365.33.921 0 1.286-.17.159-.395.243-.626.235-.237.01-.466-.08-.633-.248-.162-.168-.25-.394-.242-.627-.012-.235.07-.465.228-.64.174-.164.408-.25.647-.235M10 15.063c-.414 0-.75-.336-.75-.75V9.478c0-.415.336-.75.75-.75s.75.335.75.75v4.835c0 .414-.336.75-.75.75"
      />
    </svg>
  );
}
