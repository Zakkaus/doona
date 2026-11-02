import {languages, type Lang} from '../../i18n';
import {manualHref, type DocsAnchor} from './manualUrl';

export type {DocsAnchor};

// The manual page for a UI language, at an anchor's section when given one; docsAnchors.json names each anchor's page.
// The tests in daeuniverse/repo-for-linux check that map against the published pages, so the manual cannot move or drop an anchor linked here.
// Each language's `docs` entry in src/i18n/languages.ts names the manual locale it opens.
export function docsHref(lang: Lang, anchor?: DocsAnchor): string {
  return manualHref(languages.find(language => language.id === lang)!.docs, anchor);
}
