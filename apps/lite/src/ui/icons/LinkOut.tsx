// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function LinkOut({className, ...props}: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 20 20" aria-hidden="true" focusable="false" className={className} {...props}>
      <path
        transform="scale(1.6666667)"
        fill="currentColor"
        d="m10.08887,1h-5.51074c-.50293,0-.91113.4082-.91113.91113s.4082.91113.91113.91113h3.31055L1.35547,9.35547c-.35645.35645-.35645.93262,0,1.28906.17773.17773.41113.2666.64453.2666s.4668-.08887.64453-.2666l6.5332-6.5332v3.31055c0,.50293.4082.91113.91113.91113s.91113-.4082.91113-.91113V1.91113c0-.50293-.4082-.91113-.91113-.91113Z"
      />
    </svg>
  );
}
