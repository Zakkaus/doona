import {createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useApplyHeld} from '../features/rules/usePendingApply';
import {refetchAll, useCapabilities, useCredentialRefusal, useVersion} from '../store';
import type {Settings} from './preferences';
import {useT} from '../i18n';
import {toast} from '../ui/ui';
import {accessError, duckView, shellView, wordmark, type AboutView, type ShellView} from './view';
import {errorText} from '../api/error';

export const AboutContext = createContext<AboutView | null>(null);
export type ShellModel = ShellView & {
  spinning: boolean;
  refresh: () => Promise<void>;
  held: {count: number; label: string; busy: boolean};
  topAction: () => void;
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
      toast(failure ? 'negative' : 'positive', failure ? t('ui.refreshFailed', {error: errorText(failure, t)}) : t('ui.refreshed'));
    } finally {
      refreshLock.current = false;
      setSpinning(false);
    }
  }, [t]);
  const honk = useCallback(() => setHonked(true), []);
  // The top bar's refresh applies held rules while there are any; the latest apply is read through a ref so the
  // memoised top bar keeps one callback.
  const held = useApplyHeld();
  const latest = useRef(held);
  useLayoutEffect(() => {
    latest.current = held;
  });
  const topAction = useCallback(() => void (latest.current.count ? latest.current.apply() : refresh()), [refresh]);
  return {...view, spinning, refresh, held: {count: held.count, label: held.label, busy: held.busy}, topAction, wordmark: wordmark(honked), honk};
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
