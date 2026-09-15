// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function Home({className, ...props}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={className ? 'rp-icon ' + className : 'rp-icon'}
      {...props}
    >
      <path
        fill="currentColor"
        d="m17.13 5.734-5.75-4.472c-.812-.631-1.948-.632-2.76 0L2.87 5.735h-.002C2.324 6.157 2 6.821 2 7.511v8.239C2 16.99 3.01 18 4.25 18h11.5c1.24 0 2.25-1.01 2.25-2.25V7.51c0-.689-.324-1.353-.87-1.776M11.5 16.5h-3v-4.75c0-.413.337-.75.75-.75h1.5c.413 0 .75.337.75.75zm5-.75c0 .413-.337.75-.75.75H13v-4.75c0-1.24-1.01-2.25-2.25-2.25h-1.5C8.01 9.5 7 10.51 7 11.75v4.75H4.25c-.413 0-.75-.337-.75-.75V7.51c0-.229.108-.45.29-.592l5.75-4.47c.272-.213.65-.21.92-.002l5.75 4.472c.182.142.29.363.29.593z"
      />
    </svg>
  );
}
