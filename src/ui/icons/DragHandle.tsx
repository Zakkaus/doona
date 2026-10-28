// Adobe Spectrum UI icon (S2_DragHandleSize200), Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function DragHandle(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg viewBox="0 0 12 12" {...props}>
      {[1.6, 6, 10.4].flatMap(cy => [3.8, 8.2].map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill="currentColor" />))}
    </IconSvg>
  );
}
