// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function Data({className, ...props}: SVGProps<SVGSVGElement>) {
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
        fill="currentColor"
        d="M18 4.75c0-2.134-4.024-3.25-8-3.25S2 2.616 2 4.75c0 .067.015.13.023.196C2.017 4.985 2 5.02 2 5.06V15c0 2.062 4.147 3 8 3s8-.938 8-3V5.06c0-.04-.017-.075-.023-.114.008-.066.023-.129.023-.196m-1.5 5.245c-.092.415-2.228 1.505-6.5 1.505S3.59 10.41 3.5 10V6.724C5.03 7.567 7.524 8 10 8s4.97-.433 6.5-1.276zM10 3c4.289 0 6.5 1.227 6.5 1.75S14.289 6.5 10 6.5 3.5 5.273 3.5 4.75 5.711 3 10 3m0 13.5c-4.273 0-6.41-1.09-6.5-1.5v-3.154C5.052 12.63 7.583 13 10 13s4.948-.37 6.5-1.154v3.148c-.09.415-2.227 1.506-6.5 1.506"
      />
    </svg>
  );
}
