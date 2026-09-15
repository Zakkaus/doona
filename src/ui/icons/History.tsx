// Adobe Spectrum icon, Apache-2.0; fill adapted to currentColor.
import type {SVGProps} from 'react';

export default function History({className, ...props}: SVGProps<SVGSVGElement>) {
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
        d="M13.22 12.657c-.13 0-.26-.033-.38-.104l-3.22-1.895c-.23-.135-.37-.38-.37-.646v-5c0-.414.336-.75.75-.75s.75.336.75.75v4.571l2.85 1.677c.358.21.477.67.267 1.027-.14.237-.39.37-.647.37"
      />
      <path
        fill="currentColor"
        d="M10 1.25c-2.79 0-5.39 1.367-7.023 3.566L2.732 3.33c-.067-.41-.462-.684-.862-.618-.408.067-.685.453-.618.862l.554 3.363c.06.367.379.628.739.628q.06 0 .122-.01l3.366-.551c.41-.067.686-.453.62-.861-.068-.409-.448-.684-.862-.62L4.106 5.8C5.454 3.92 7.648 2.75 10 2.75c3.998 0 7.25 3.252 7.25 7.25s-3.252 7.25-7.25 7.25c-2.98 0-5.623-1.787-6.731-4.552-.155-.385-.591-.572-.976-.417s-.571.59-.417.975C3.215 16.594 6.403 18.75 10 18.75c4.825 0 8.75-3.925 8.75-8.75S14.825 1.25 10 1.25"
      />
    </svg>
  );
}
