import anchors from './docsAnchors.json';
import {languages, type Lang} from '../../i18n';

// The docs site, built and published from Zakkaus/doona-docs.
export const DOCS_URL = 'https://zakkaus.github.io/doona-docs/';

export type DocsAnchor = keyof typeof anchors;

// The docs page for a UI language, at an anchor's section when given one; docsAnchors.json names each anchor's page.
// doona-docs checks that map against its pages, so the docs cannot move or drop an anchor linked here.
// Each language's `docs` entry in src/i18n/languages.ts names the docs folder it opens.
export function docsHref(lang: Lang, anchor?: DocsAnchor): string {
  const locale = languages.find(language => language.id === lang)!.docs;
  return anchor ? `${DOCS_URL}${locale}/${anchors[anchor]}.html#${anchor}` : `${DOCS_URL}${locale}/`;
}
