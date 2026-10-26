import type {SVGProps} from 'react';
export default function Widgets(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="rp-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="12" y="3" width="5" height="9" rx="1" />
      <rect x="3" y="12" width="6" height="5" rx="1" />
      <path d="M12 15h5" />
    </svg>
  );
}
