import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {refetchAll, useCapabilities, useCredentialRefusal, useVersion} from '../store';
import type {Settings} from './preferences';
import {useLang, useT} from '../i18n';
import {toast, toastErrorDetail} from '../ui/ui';
import {accessError, duckView, shellView, wordmark, type AboutView, type ShellView} from './view';
import {docsHref} from '../features/shared/docs';
import {warmAllPages} from './registry';

export const AboutContext = createContext<AboutView | null>(null);
export type ShellModel = ShellView & {
  spinning: boolean;
  refresh: () => Promise<void>;
  wordmark: string;
  honk: () => void;
};
export function useShell(settings: Settings, route: string): ShellModel {
  const t = useT();
  const capabilities = useCapabilities();
  const version = useVersion();
  const refusal = useCredentialRefusal();
  const capabilityError = accessError(capabilities.error, refusal);
  const [spinning, setSpinning] = useState(false);
  const [honked, setHonked] = useState(false);
  const refreshLock = useRef(false);
  // Pages download once the backend accepts the tab, on a restored session or after signing in.
  const accepted = !!capabilities.data;
  useEffect(() => {
    if (accepted) warmAllPages();
  }, [accepted]);
  const view = useMemo(
    () => shellView(settings, route, capabilities.data, capabilityError, version.data, version.error, t),
    [settings, route, capabilities.data, capabilityError, version.data, version.error, t]
  );
  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setSpinning(true);
    try {
      const outcomes = await refetchAll();
      // A resource unsubscribed by navigating away mid-refresh did not fail.
      const failure = outcomes.flatMap(outcome => (outcome.ok || outcome.error.name === 'AbortError' ? [] : [outcome.error]))[0];
      if (failure) toast('negative', t('ui.refreshFailed'), toastErrorDetail(failure, t));
      else toast('positive', t('ui.refreshed'));
    } finally {
      refreshLock.current = false;
      setSpinning(false);
    }
  }, [t]);
  const honk = useCallback(() => setHonked(true), []);
  return {...view, spinning, refresh, wordmark: wordmark(honked), honk};
}
export function useAbout(onHonk?: () => void) {
  const view = useContext(AboutContext)!;
  const t = useT();
  const lang = useLang();
  const [taps, setTaps] = useState(0);
  return {
    ...view,
    guide: {href: docsHref(lang), label: t('shell.guide')},
    ...duckView(taps),
    taps,
    tap: () => {
      if (taps === 4) onHonk?.();
      setTaps(value => value + 1);
    }
  };
}
