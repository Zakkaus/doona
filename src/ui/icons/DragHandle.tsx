// Adobe Spectrum UI icon (S2_DragHandleSize200), Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function DragHandle({className, ...props}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={12}
      height={12}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      className={cx('rp-icon', className)}
      {...props}
    >
      {[1.6, 6, 10.4].flatMap(cy => [3.8, 8.2].map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill="currentColor" />))}
    </svg>
  );
}
