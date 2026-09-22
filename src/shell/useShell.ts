import {createContext, useCallback, useContext, useMemo, useRef, useState} from 'react';
import {refetchAll, useCapabilities, useVersion} from '../store';
import type {Settings} from '../features/settings/settings';
import {useT} from '../i18n';
import {errorText, toast} from '../ui/ui';
import {duckView, shellView, wordmark, type AboutView, type ShellView} from './view';

export const AboutContext = createContext<AboutView | null>(null);
export type ShellModel = ShellView & {spinning: boolean; refresh: () => Promise<void>; wordmark: string; honk: () => void};
export function useShell(settings: Settings, route: string): ShellModel {
  const t = useT();
  const capabilities = useCapabilities();
  const version = useVersion();
  const [spinning, setSpinning] = useState(false);
  const [honked, setHonked] = useState(false);
  const refreshLock = useRef(false);
  const view = useMemo(
    () => shellView(settings, route, capabilities.data, capabilities.error, version.data, version.error, t),
    [settings, route, capabilities.data, capabilities.error, version.data, version.error, t]
  );
  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setSpinning(true);
    try {
      const outcomes = await refetchAll();
      // A resource unsubscribed by navigating away mid-refresh did not fail.
      const failure = outcomes.flatMap(outcome => (outcome.ok || outcome.error.name === 'AbortError' ? [] : [outcome.error]))[0];
      toast(failure ? 'negative' : 'positive', failure ? t('ui.refreshFailed', {error: errorText(failure)}) : t('ui.refreshed'));
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
  const [taps, setTaps] = useState(0);
  return {
    ...view,
    ...duckView(taps),
    taps,
    tap: () => {
      if (taps === 4) onHonk?.();
      setTaps(value => value + 1);
    }
  };
}
