// Adobe Spectrum UI icon (Dash, size 100), Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Dash(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg width={10} height={10} viewBox="0 0 10 10" {...props}>
      <path fill="currentColor" d="m8.5,6H1.5c-.55273,0-1-.44727-1-1s.44727-1,1-1h7c.55273,0,1,.44727,1,1s-.44727,1-1,1Z" />
    </IconSvg>
  );
}
