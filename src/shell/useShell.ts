import {createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useApplyHeld} from '../features/shared/usePendingApply';
import {useLifecycle} from '../features/shared/useLifecycle';
import {refetchAll, useCapabilities, useCredentialRefusal, useVersion} from '../store';
import type {Settings} from './preferences';
import {useT} from '../i18n';
import {toast} from '../ui/ui';
import {accessError, duckView, shellView, wordmark, type AboutView, type ShellView} from './view';
import {errorText} from '../api/error';

export const AboutContext = createContext<AboutView | null>(null);
const rereadAll = () => void refetchAll();
export type ShellModel = ShellView & {
  spinning: boolean;
  refresh: () => Promise<void>;
  reload: {shown: boolean; held: number; label: string; busy: boolean; run: () => void};
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
      if (failure) toast('negative', t('ui.refreshFailed'), {detail: errorText(failure, t)});
      else toast('positive', t('ui.refreshed'));
    } finally {
      refreshLock.current = false;
      setSpinning(false);
    }
  }, [t]);
  const honk = useCallback(() => setHonked(true), []);
  // The top bar's reload writes held rules and reloads while there are any, and otherwise reloads the engine. The
  // latest state is read through a ref so the memoised top bar keeps one callback.
  const held = useApplyHeld();
  // A reload can change any resource, so every one is read again once it settles.
  const lifecycle = useLifecycle(undefined, capabilities.data, rereadAll);
  const latest = useRef({held, lifecycle});
  useLayoutEffect(() => {
    latest.current = {held, lifecycle};
  });
  const run = useCallback(() => void (latest.current.held.count ? latest.current.held.apply() : latest.current.lifecycle.run('reload')), []);
  const reload = {
    shown: !!held.count || lifecycle.canRun('reload'),
    held: held.count,
    label: held.count ? held.label : t('shell.reloadEngine'),
    busy: held.busy || lifecycle.busy === 'reload',
    run
  };
  return {...view, spinning, refresh, reload, wordmark: wordmark(honked), honk};
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
