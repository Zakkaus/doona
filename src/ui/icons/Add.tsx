// Adobe Spectrum UI icon (Add, size 100), Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Add(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg width={10} height={10} viewBox="0 0 10 10" {...props}>
      <path
        fill="currentColor"
        d="m8.5,4h-2.5V1.5c0-.55273-.44727-1-1-1s-1,.44727-1,1v2.5H1.5c-.55273,0-1,.44727-1,1s.44727,1,1,1h2.5v2.5c0,.55273.44727,1,1,1s1-.44727,1-1v-2.5h2.5c.55273,0,1-.44727,1-1s-.44727-1-1-1Z"
      />
    </IconSvg>
  );
}
