// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function AlertTriangle({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M10 15.123c-.231.008-.456-.073-.627-.228-.33-.365-.33-.92 0-1.285.17-.158.395-.242.626-.234.237-.01.466.08.633.247.162.168.25.394.242.627.012.235-.07.465-.228.639-.174.164-.408.25-.647.234M10 11.75c-.414 0-.75-.336-.75-.75V7c0-.414.336-.75.75-.75s.75.336.75.75v4c0 .414-.336.75-.75.75"
      />
      <path
        fill="currentColor"
        d="M16.733 18H3.267c-.8 0-1.523-.41-1.933-1.098s-.427-1.518-.046-2.222L8.02 2.232c.394-.727 1.152-1.18 1.979-1.18s1.585.453 1.979 1.18l6.733 12.448c.381.704.364 1.535-.046 2.222S17.534 18 16.733 18M10 2.553c-.134 0-.468.038-.66.392L2.607 15.393c-.183.338-.05.631.016.74.065.111.259.367.644.367h13.466c.385 0 .579-.256.644-.366s.2-.403.016-.741L10.66 2.945c-.192-.354-.526-.392-.66-.392"
      />
    </svg>
  );
}
