import type {SVGProps} from 'react';

export default function Settings({className, ...props}: SVGProps<SVGSVGElement>) {
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
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        d="M8 2h4l.5 2.2 1.3.8 2.2-.6 2 3.4-1.7 1.5v1.4l1.7 1.5-2 3.4-2.2-.6-1.3.8L12 18H8l-.5-2.2-1.3-.8-2.2.6-2-3.4 1.7-1.5V9.3L2 7.8l2-3.4 2.2.6 1.3-.8Z"
      />
      <circle cx={10} cy={10} r={3} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
