import {startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {MessageKey} from './i18n';

let revision = 0;
export function invalidateReads() {
  revision++;
  window.dispatchEvent(new Event('lite-data-changed'));
}

// A change of `key` reloads with the same loader, for reads that must refresh after an outside event.
export function useRead<T>(load: (signal?: AbortSignal) => Promise<T>, key?: unknown) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const readRevision = useRef(revision);
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    readRevision.current = revision;
    setLoading(true);
    setError(undefined);
    try {
      const result = await load(controller.signal);
      if (!controller.signal.aborted)
        startTransition(() => {
          setData(result);
          setLoading(false);
        });
      return result;
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure);
        setLoading(false);
      }
      throw failure;
    } finally {
      if (!controller.signal.aborted) {
        if (active.current === controller) active.current = null;
      }
    }
  }, [load]);
  const loadedWith = useRef<{load: typeof load; key: unknown} | null>(null);
  // Activity restores cached pages before passive effects; disable stale actions before paint.
  useLayoutEffect(() => {
    if (loadedWith.current?.load !== load || loadedWith.current.key !== key || active.current?.signal.aborted || readRevision.current !== revision) {
      loadedWith.current = {load, key};
      void reload().catch(() => {});
    }
    const changed = () => {
      void reload().catch(() => {});
    };
    window.addEventListener('lite-data-changed', changed);
    return () => {
      active.current?.abort();
      window.removeEventListener('lite-data-changed', changed);
    };
  }, [load, key, reload]);
  return {data, setData, error, loading, reload};
}

// A draft keeps the source of its first edit: a re-read may refresh the page, but must not move the If-Match base under the draft.
export const draftBase = <T>(pinned: T | undefined, current: T | undefined, editing: boolean) => (editing ? (pinned ?? current) : current);
export function useDraftBase<T>(current: T | undefined, editing: boolean) {
  const [pinned, setPinned] = useState<T>();
  const base = draftBase(pinned, current, editing);
  if ((editing ? base : undefined) !== pinned) setPinned(editing ? base : undefined);
  return base;
}

export type Notice = {key: MessageKey; values?: Record<string, string>} | {error: unknown};
export const noticeText = (template: string, values?: Record<string, string>) =>
  Object.entries(values ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), template);

// Pages read again when the window regains focus, at most every 15 s, unless a draft is open.
export function useFocusRefresh(reload: () => Promise<unknown>, enabled: boolean) {
  const last = useRef(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current < 15000) return;
      last.current = Date.now();
      void reload().catch(() => {});
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload, enabled]);
}
export function useTask(setAppBusy: (busy: boolean) => void) {
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>();
  const run = async (id: string, action: () => Promise<Notice | undefined>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    // The shell only mirrors app-wide busy state, so its re-render can yield to the clicked control.
    startTransition(() => setAppBusy(true));
    setNotice(undefined);
    try {
      const result = await action();
      startTransition(() => setNotice(result));
    } catch (error) {
      setNotice({error});
    } finally {
      lock.current = false;
      setBusy(null);
      setAppBusy(false);
    }
  };
  return {busy, notice, run};
}
