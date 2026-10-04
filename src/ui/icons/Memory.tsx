// Drawn for doona in the 20 px Spectrum icon style; fill follows currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Memory(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3 5h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 17 14H3a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 3 5m.25 1.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h13.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25zM5 8h2.5v3H5zM8.75 8h2.5v3h-2.5zM12.5 8H15v3h-2.5zM4.25 14h1.5v2.5h-1.5zM7.25 14h1.5v2.5h-1.5zM11.25 14h1.5v2.5h-1.5zM14.25 14h1.5v2.5h-1.5z"
      />
    </IconSvg>
  );
}
