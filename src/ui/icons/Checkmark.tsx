// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Checkmark(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        d="M7.864 15.734c-.222 0-.433-.098-.576-.27l-3.747-4.497c-.266-.319-.222-.792.096-1.057.317-.265.79-.223 1.056.096l3.154 3.786 7.44-9.469c.255-.326.728-.382 1.052-.127.326.256.383.728.127 1.053L8.454 15.447c-.14.179-.352.284-.579.287z"
      />
    </IconSvg>
  );
}
