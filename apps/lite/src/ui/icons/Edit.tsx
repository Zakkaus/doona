// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';
import IconSvg from './IconSvg';

export default function Edit(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path
        fill="currentColor"
        d="M17.78 1.757C16.51.716 14.555.858 13.33 2.08L3.079 12.334c-.32.32-.559.717-.69 1.15l-1.384 4.584c-.08.265-.007.552.188.747.142.143.334.22.53.22q.11 0 .217-.032l4.582-1.384c.434-.13.832-.368 1.151-.688L18.028 6.575c.648-.647.993-1.545.948-2.46s-.482-1.775-1.195-2.358M2.846 17.163l.98-3.246q.042-.135.113-.257l2.41 2.409q-.123.07-.259.114zM16.966 5.516l-9.525 9.526-2.475-2.476 9.425-9.425c.386-.387.896-.586 1.39-.586.38 0 .752.119 1.05.362.392.321.621.772.646 1.272.025.494-.161.977-.51 1.327"
      />
    </IconSvg>
  );
}
