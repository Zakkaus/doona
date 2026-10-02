// Drawn for doona, not an Adobe icon: three stacked dots on the Spectrum 20px grid for the overflow menu of a top bar.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function MoreVertical(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        d="M10 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"
      />
    </IconSvg>
  );
}
