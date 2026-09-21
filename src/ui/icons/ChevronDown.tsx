// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function ChevronDown({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M3.755 7.243c.287-.299.762-.308 1.06-.02l5.183 4.986 5.197-4.999c.298-.288.773-.278 1.06.02.287.297.278.773-.02 1.06l-5.717 5.5c-.29.28-.75.28-1.04 0L3.776 8.303c-.153-.147-.23-.344-.23-.54 0-.188.07-.375.21-.52"
      />
    </svg>
  );
}
