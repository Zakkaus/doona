import {createContext, use, useLayoutEffect} from 'react';

// The modal dialogs open on a page, counted while they are mounted. The shell does not keep a page hidden behind a
// dialog left open, which would come back with it when the page shows; it builds that page anew, as leaving it always did.
// The context holds a key per page; the counts live here, as the drafts do in draft.ts.
export type OverlayScope = object;
export const OverlayScopeContext = createContext<OverlayScope | null>(null);
const counts = new WeakMap<OverlayScope, number>();

export const hasOpenOverlay = (scope: OverlayScope) => !!counts.get(scope);

export function OpenOverlay() {
  const scope = use(OverlayScopeContext);
  useLayoutEffect(() => {
    if (!scope) return;
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
    return () => void counts.set(scope, counts.get(scope)! - 1);
  }, [scope]);
  return null;
}
