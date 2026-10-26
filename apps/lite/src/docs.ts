import type {Locale} from './i18n';

export function docsHref(locale: Locale, anchor: 'reload-and-restart'): string {
  return `https://zakkaus.github.io/doona-docs/${locale}/install.html#${anchor}`;
}
