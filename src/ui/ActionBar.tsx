import type {ReactNode} from 'react';

// A bar pinned to the bottom of the view for work that is pending on the page, as S2's ActionBar: a message the
// screen reader hears when it changes, and the actions that settle it.
export function ActionBar({label, message, children}: {label: string; message: string; children: ReactNode}) {
  return (
    <div className="rp-actionbar" role="region" aria-label={label}>
      <span aria-live="polite">{message}</span>
      <div className="rp-toolbar">{children}</div>
    </div>
  );
}
