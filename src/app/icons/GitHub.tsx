'use client';
import {createIcon} from '@react-spectrum/s2';

import type {SVGProps} from 'react';
import {Ref, forwardRef} from 'react';
const SvgComponent = (props: SVGProps<SVGSVGElement>, ref: Ref<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 20 20" ref={ref} {...props}>
    <path
      fill="var(--iconPrimary, light-dark(rgb(41, 41, 41), rgb(219, 219, 219)))"
      d="M10 1.5a8.5 8.5 0 0 0-2.69 16.57c.43.08.58-.18.58-.41v-1.44c-2.36.51-2.86-1.14-2.86-1.14-.39-.98-.95-1.24-.95-1.24-.77-.53.06-.52.06-.52.85.06 1.3.88 1.3.88.76 1.3 1.99.92 2.47.71.08-.55.3-.93.54-1.14-1.89-.22-3.87-.95-3.87-4.2 0-.93.33-1.69.87-2.28-.09-.22-.38-1.08.08-2.25 0 0 .71-.23 2.34.87a8.1 8.1 0 0 1 4.26 0c1.62-1.1 2.33-.87 2.33-.87.47 1.17.18 2.03.09 2.25.54.59.87 1.35.87 2.28 0 3.26-1.99 3.98-3.88 4.19.31.26.58.78.58 1.58v2.34c0 .23.15.5.58.41A8.5 8.5 0 0 0 10 1.5"
    />
  </svg>
);
const ForwardRef = forwardRef(SvgComponent);

export default /*#__PURE__*/ createIcon(ForwardRef);
