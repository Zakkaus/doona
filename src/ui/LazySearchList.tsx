import {Suspense, type ComponentProps} from 'react';
import {preloadable} from './preloadable';
import {TextField} from './Fields';
import type {SearchList} from './SearchList';

// The search for a long list stays out of the startup bundle: it loads when such a list first opens, or ahead of the
// press when its trigger is hovered or focused (`preloadSearchList`). Until it arrives, a disabled field and the list's
// full height hold the popover's size.
const search = preloadable<ComponentProps<typeof SearchList>>(() => import('./SearchList').then(module => ({default: module.SearchList})));
export const preloadSearchList = () => void search.preload().catch(() => undefined);
export function LazySearchList({label, children}: ComponentProps<typeof SearchList>) {
  return (
    <Suspense
      fallback={
        <>
          <TextField search label={label} isDisabled className="rp-menu-search" />
          <div className="rp-menu-scroll rp-menu-pending" />
        </>
      }
    >
      <search.Component label={label}>{children}</search.Component>
    </Suspense>
  );
}
