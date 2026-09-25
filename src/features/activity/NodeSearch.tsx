import type {ReactNode} from 'react';
import {Autocomplete, ListLayout, Virtualizer, useFilter} from 'react-aria-components';
import {TextField} from '../../ui/ui';
import {useT} from '../../i18n';

// A long node list gets a filter field and a virtual list. It renders only inside an opened menu, so it loads apart
// from the page.
export function NodeSearch({children}: {children: ReactNode}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  return (
    <Autocomplete filter={contains}>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user into the opened menu */}
      <TextField search label={t('policy.filter')} autoFocus className="rp-menu-search" />
      <Virtualizer layout={ListLayout} layoutOptions={{rowHeight: 32, headingHeight: 26}}>
        {children}
      </Virtualizer>
    </Autocomplete>
  );
}
