// A circular arrow around a play mark, drawn to match the Spectrum icons' 1.5px stroke; fill uses currentColor.
import type {SVGProps} from 'react';
import {cx} from '../cx';

export default function Replay({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M3.75 10a6.25 6.25 0 1 0 1.83-4.42M5.58 2.83v2.75h2.75"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path fill="currentColor" d="M8.5 7.8c0-.39.42-.63.76-.43l3.5 2.2c.31.2.31.66 0 .86l-3.5 2.2c-.34.2-.76-.04-.76-.43z" />
    </svg>
  );
}
