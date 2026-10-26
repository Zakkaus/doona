// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Close(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        d="m11.06 10 5.207-5.206c.293-.293.293-.768 0-1.06s-.767-.294-1.06 0L10 8.938 4.793 3.733c-.293-.293-.767-.293-1.06 0s-.293.768 0 1.06L8.939 10l-5.206 5.206c-.293.293-.293.768 0 1.06.146.147.338.22.53.22s.384-.073.53-.22L10 11.062l5.207 5.206c.146.146.338.22.53.22s.384-.074.53-.22c.293-.293.293-.768 0-1.06z"
      />
    </IconSvg>
  );
}
