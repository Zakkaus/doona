import type {SVGProps} from 'react';
import IconSvg from './IconSvg';
export default function Widgets(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="12" y="3" width="5" height="9" rx="1" />
      <rect x="3" y="12" width="6" height="5" rx="1" />
      <path d="M12 15h5" />
    </IconSvg>
  );
}
