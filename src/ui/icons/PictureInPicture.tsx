import type {SVGProps} from 'react';
import IconSvg from './IconSvg';
export default function PictureInPicture(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M17.5 8V5.5A1.5 1.5 0 0 0 16 4H3.5A1.5 1.5 0 0 0 2 5.5v8A1.5 1.5 0 0 0 3.5 15H7" />
      <rect x="10" y="11" width="8" height="6" rx="1.5" />
    </IconSvg>
  );
}
