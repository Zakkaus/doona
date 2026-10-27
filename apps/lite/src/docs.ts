import type {Locale} from './i18n';

export function docsHref(locale: Locale, anchor: 'reload-and-restart'): string {
  return `https://doona.daeuniverse.org/${locale}/install.html#${anchor}`;
}
