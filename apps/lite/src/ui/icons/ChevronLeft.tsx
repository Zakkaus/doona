import type {SVGProps} from 'react';
import ChevronDown from './ChevronDown';
export default function ChevronLeft(props: SVGProps<SVGSVGElement>) {
  return <ChevronDown {...props} style={{...props.style, transform: 'rotate(90deg)'}} />;
}
