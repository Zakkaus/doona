import anchors from './docsAnchors.json';

export type DocsAnchor = keyof typeof anchors;

export type ManualLocale = 'en' | 'zh-CN' | 'zh-TW';

// The manual lives in daeuniverse/repo-for-linux (docs/doona/) and is served by daeuniverse.org; English has no locale prefix.
const MANUAL = 'https://daeuniverse.org';

// The manual's start page, or the page that holds the anchor, at its section.
export function manualHref(locale: ManualLocale, anchor?: DocsAnchor): string {
  return `${MANUAL}${locale === 'en' ? '' : `/${locale}`}/doona/${anchor ? `${anchors[anchor]}#${anchor}` : ''}`;
}
