import type {Translator} from '../../i18n';

// Why refreshing every subscription is disabled: only once the list is read, idle and holds none.
export function refreshAllReason({ready, busy, count}: {ready: boolean; busy: boolean; count: number}, t: Translator): string | null {
  return ready && !busy && !count ? t('settings.noSubscriptions') : null;
}
