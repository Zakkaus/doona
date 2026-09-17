import {useSyncExternalStore} from 'react';

// The browser's "install this site as an app" offer, kept so a button can trigger it later. Chrome and Edge
// fire beforeinstallprompt once the manifest and service worker qualify; other browsers never do, and the
// button stays hidden there.
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
    await offer.prompt();
    const choice = await offer.userChoice;
    if (choice.outcome === 'accepted') {
      deferred = null;
      notify();
    }
    return choice.outcome === 'accepted';
  };
}
