import anchors from '../../../src/features/shared/docsAnchors.json';
import type {Locale} from './i18n';

// The standard edition's anchor map, so both editions open the same section and doona-docs checks lite's links too.
export type DocsAnchor = keyof typeof anchors;

// Without an anchor it opens the guide's start page.
export function docsHref(locale: Locale, anchor?: DocsAnchor): string {
  return `https://doona.daeuniverse.org/${locale}/${anchor ? `${anchors[anchor]}.html#${anchor}` : ''}`;
}
