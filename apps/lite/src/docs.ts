import {manualHref, type DocsAnchor} from '../../../src/features/shared/manualUrl';
import type {Locale} from './i18n';

// The standard edition's anchor map, so both editions open the same section and the manual's tests cover lite's links too.
export type {DocsAnchor};

// Without an anchor it opens the manual's start page.
export function docsHref(locale: Locale, anchor?: DocsAnchor): string {
  return manualHref(locale, anchor);
}
