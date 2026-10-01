import type {SVGProps} from 'react';
export default function Pin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="rp-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <path d="m7 3 6 0-1 5 3 3v2H5v-2l3-3-1-5Zm3 10v5" />
    </svg>
  );
}
