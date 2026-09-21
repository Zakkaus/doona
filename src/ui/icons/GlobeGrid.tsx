// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function GlobeGrid({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M10 1.252c-4.825 0-8.75 3.925-8.75 8.75s3.925 8.75 8.75 8.75 8.75-3.925 8.75-8.75-3.925-8.75-8.75-8.75m7.21 8H14.07c-.14-2.33-.915-4.526-2.192-6.245 2.856.767 5.023 3.231 5.334 6.245m-7.198 7.631c-1.49-1.537-2.419-3.745-2.582-6.131h5.14c-.162 2.388-1.081 4.593-2.558 6.131M7.431 9.252c.162-2.387 1.091-4.594 2.581-6.132 1.477 1.538 2.396 3.743 2.558 6.132zm.715-6.251c-1.29 1.72-2.074 3.92-2.215 6.251H2.79c.312-3.022 2.49-5.49 5.357-6.251M2.79 10.752h3.142c.141 2.33.926 4.53 2.216 6.25-2.867-.759-5.046-3.228-5.358-6.25m9.088 6.245c1.277-1.72 2.052-3.915 2.192-6.245h3.142c-.311 3.014-2.479 5.478-5.334 6.245"
      />
    </svg>
  );
}
