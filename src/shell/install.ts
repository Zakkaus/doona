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
type InstallHint = 'ios' | 'mac';
type InstallNavigator = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & {standalone?: boolean};
// Picks the manual install steps for a browser that has no install prompt, or null when the page already runs as an app
// or the browser offers no install path we can name. Safari exposes no install API, so its user agent has to identify it.
// The version must directly precede Safari/, which rules out Chrome, Firefox, Edge and in-app browsers on iOS.
// navigator.standalone exists only in iOS and iPadOS WebKit; iPadOS sends a Mac user agent, so touch points tell it from a Mac.
// Add to Dock needs macOS Sonoma, and Safari 26 is the first release that no older macOS can run.
export function installHint(nav: InstallNavigator = navigator, matches = (query: string) => matchMedia(query).matches): InstallHint | null {
  if (nav.standalone || matches('(display-mode: standalone), (display-mode: minimal-ui)')) return null;
  const safari = /Version\/(\d+)[.\d]* (?:Mobile\/\w+ )?Safari\//.exec(nav.userAgent);
  if (!safari) return null;
  if (typeof nav.standalone === 'boolean' && (/iP(?:hone|ad|od)/.test(nav.userAgent) || nav.maxTouchPoints > 1)) return 'ios';
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints < 2 && Number(safari[1]) >= 26 ? 'mac' : null;
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
      toast('negative', t('settings.installFailed'), {detail: errorText(error, t)});
      return false;
    }
  };
}
