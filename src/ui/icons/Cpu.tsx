// Drawn for doona in the 20 px Spectrum icon style; fill follows currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Cpu(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5.5 4h9A1.5 1.5 0 0 1 16 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4m.25 1.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25zM7.5 7.5h5v5h-5zM6.25 1.5h1.5V4h-1.5zM6.25 16h1.5v2.5h-1.5zM1.5 6.25H4v1.5H1.5zM16 6.25h2.5v1.5H16zM9.25 1.5h1.5V4h-1.5zM9.25 16h1.5v2.5h-1.5zM1.5 9.25H4v1.5H1.5zM16 9.25h2.5v1.5H16zM12.25 1.5h1.5V4h-1.5zM12.25 16h1.5v2.5h-1.5zM1.5 12.25H4v1.5H1.5zM16 12.25h2.5v1.5H16z"
      />
    </IconSvg>
  );
}
