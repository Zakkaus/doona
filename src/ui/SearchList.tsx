import type {ReactNode} from 'react';
import {Autocomplete, ListLayout, Virtualizer, useFilter} from 'react-aria-components';
import {TextField} from './Fields';
import {ControlSizeContext} from './controlSize';

// A long list in a popover gets a filter field and a virtual list: the child is a menu or a list box, filtered by name
// as typed, ignoring case and accents. It lives in its own module so a page can load it only when a long list opens.
export function SearchList({label, children}: {label: string; children: ReactNode}) {
  const {contains} = useFilter({sensitivity: 'base'});
  return (
    <ControlSizeContext value={null}>
      <Autocomplete filter={contains}>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user into the opened popover */}
        <TextField search label={label} autoFocus className="rp-menu-search" />
        <Virtualizer layout={ListLayout} layoutOptions={{estimatedRowHeight: 32, estimatedHeadingHeight: 26}}>
          {children}
        </Virtualizer>
      </Autocomplete>
    </ControlSizeContext>
  );
}
