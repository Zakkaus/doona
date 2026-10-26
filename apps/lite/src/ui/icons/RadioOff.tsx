// Adobe Spectrum circle outline, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function RadioOff(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"
      />
    </IconSvg>
  );
}
