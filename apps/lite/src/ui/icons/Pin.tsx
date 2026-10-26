// Pin outline from doona's icon set; stroke adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Pin(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="m7 3 6 0-1 5 3 3v2H5v-2l3-3-1-5Zm3 10v5" />
    </IconSvg>
  );
}
