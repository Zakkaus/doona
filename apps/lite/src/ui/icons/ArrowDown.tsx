// Plain arrow drawn on the Spectrum icons' 20px grid with their 1.5px line weight; stroke uses currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function ArrowDown(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M10 3.5v13M4.75 11.5 10 16.75l5.25-5.25" />
    </IconSvg>
  );
}
