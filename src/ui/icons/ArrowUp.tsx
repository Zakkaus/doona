// Plain arrow drawn on the Spectrum icons' 20px grid with their 1.5px line weight; stroke uses currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function ArrowUp(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M10 16.5v-13M4.75 8.5 10 3.25l5.25 5.25" />
    </IconSvg>
  );
}
