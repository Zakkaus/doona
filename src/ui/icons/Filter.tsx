// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function Filter({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M8.999 18.729c-.36 0-.717-.099-1.037-.293C7.359 18.07 7 17.43 7 16.726V10.49c0-.186-.068-.364-.192-.501l-4.18-4.644c-.538-.59-.674-1.416-.349-2.152S3.305 2 4.11 2h11.782c.804 0 1.505.457 1.83 1.193s.19 1.562-.353 2.156l-4.176 4.64c-.124.137-.192.315-.192.501v5.046c0 .843-.465 1.609-1.213 1.997l-1.865.968c-.292.152-.609.228-.923.228M4.109 3.5c-.295 0-.418.209-.458.298s-.11.322.088.54l4.184 4.647c.372.413.577.948.577 1.505v6.236c0 .254.168.383.24.427.073.045.266.133.49.017l1.866-.969c.25-.13.404-.384.404-.665V10.49c0-.557.205-1.092.577-1.505l4.18-4.644c.202-.22.132-.453.092-.543s-.163-.298-.458-.298z"
      />
    </svg>
  );
}
