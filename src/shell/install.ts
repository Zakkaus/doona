import {useSyncExternalStore} from 'react';
import {toast} from '../ui/Feedback';
import {errorText} from '../api/error';
import {useT} from '../i18n';

// Keeps beforeinstallprompt for a later button. Only Chrome and Edge emit it; elsewhere the button stays hidden.
type InstallPrompt = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>};
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    notify();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}
export function useInstallOffer(): (() => Promise<boolean>) | null {
  const t = useT();
  const offer = useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => deferred,
    () => null
  );
  if (!offer) return null;
  return async () => {
    if (deferred !== offer) return false;
    deferred = null;
    notify();
    try {
      await offer.prompt();
      return (await offer.userChoice).outcome === 'accepted';
    } catch (error) {
      toast('negative', t('settings.installFailed', {error: errorText(error, t)}));
      return false;
    }
  };
}
