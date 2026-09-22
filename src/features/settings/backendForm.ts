import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {useT, type Params} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {createApi} from '../../api/client';
import {uuid} from '../../api/hash';
import {ApiError} from '../../api/error';
import {normalizeApi, writeProfiles, type Profile} from '../../api/profiles';
import {toast, useLinked} from '../../ui/ui';
import {readSettings} from './settings';
import {useDraftGuard} from '../config/useDraftGuard';
import {buildHash} from '../../shell/route';

type Result = {key: Key; params?: Params; error?: boolean; requestId?: string | null};

function readPairing(query: string): {api: string; token: string} | null {
  const params = new URLSearchParams(query);
  const api = params.get('api');
  return api ? {api, token: params.get('token') ?? ''} : null;
}

export function useBackendForm(query: string) {
  const t = useT();
  const [saved] = useState(readSettings);
  const [api, setApi] = useState(saved.api ?? '');
  const [token, setToken] = useState(saved.token);
  const [paired, setPaired] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  // Pairing links also fill an already-open form without saving the credentials.
  const dirty = api !== (saved.api ?? '') || token !== saved.token;
  const guard = useDraftGuard(dirty);
  useLinked(guard.revision, () => {
    setApi(saved.api ?? '');
    setToken(saved.token);
    setPaired(false);
  });
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  if (lastQuery !== query) {
    setLastQuery(query);
    const pair = readPairing(query);
    if (pair) {
      setPaired(true);
      setApi(pair.api);
      setToken(pair.token);
      setPending(false);
      setResult(null);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(query);
    if (params.has('api')) {
      params.delete('api');
      params.delete('token');
      history.replaceState(history.state, '', location.pathname + location.search + buildHash('settings', params.toString()));
    }
    const card = params.get('card');
    if (card) document.getElementById('settings-' + card)?.scrollIntoView({block: 'start'});
  }, [query]);
  const active = saved.profiles.find(profile => profile.id === saved.activeId);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const controller = request.current;
      request.current = null;
      controller?.abort();
    },
    []
  );

  const resetProbe = useCallback(() => {
    const controller = request.current;
    request.current = null;
    controller?.abort();
    setPending(false);
    setResult(null);
  }, []);
  useLayoutEffect(() => {
    if (!readPairing(query)) return;
    const controller = request.current;
    request.current = null;
    controller?.abort();
  }, [query]);
  const validate = (value: string) => {
    try {
      const base = normalizeApi(value);
      setInvalid(false);
      return base;
    } catch {
      setInvalid(true);
      return null;
    }
  };
  const changeApi = (value: string) => {
    setApi(value);
    validate(value);
    resetProbe();
  };
  const changeToken = (value: string) => {
    setToken(value);
    resetProbe();
  };
  const persist = (profiles: Profile[], activeId: string) => {
    if (saveLock.current) return;
    saveLock.current = true;
    flushSync(() => setSaving(true));
    try {
      writeProfiles({profiles, activeId});
    } catch {
      setResult({key: 'settings.saveError', error: true});
      saveLock.current = false;
      setSaving(false);
      toast('negative', t('settings.saveError'));
      return;
    }
    try {
      guard.clear();
      sessionStorage.setItem('doona-saved', '1');
    } catch {}
    // Rebuild requests, SSE subscriptions, and module-level observation state for the new backend.
    location.reload();
  };
  const editedProfiles = () => {
    const base = validate(api);
    if (base === null) return null;
    const profile = {...(active ?? {id: uuid(), name: t('settings.backend')}), api: base, token};
    return active ? saved.profiles.map(item => (item.id === active.id ? profile : item)) : [profile];
  };
  const save = () => {
    const profiles = editedProfiles();
    if (profiles) persist(profiles, active?.id ?? profiles[0].id);
    else toast('negative', t('settings.invalidUrl'));
  };
  const [switchId, setSwitchId] = useState<string | null>(null);
  const switchProfile = (id: string) => {
    if (id === saved.activeId || !saved.profiles.some(profile => profile.id === id)) return;
    if (dirty) setSwitchId(id);
    else persist(saved.profiles, id);
  };
  const confirmSwitch = () => {
    if (switchId !== null) persist(saved.profiles, switchId);
  };
  const testConnection = async () => {
    if (request.current) return;
    resetProbe();
    const base = validate(api);
    if (base === null) return;
    if (!base || base === 'mock') {
      setResult({key: 'settings.demo'});
      toast('neutral', t('settings.demo'));
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('Connection timeout', 'TimeoutError')), 5000);
    setPending(true);
    try {
      const discovery = await createApi(base, token).discovery(controller.signal);
      if (!discovery || !Number.isInteger(discovery.api_major) || discovery.api_major < 1) {
        throw new ApiError(200, 'invalid_discovery', 'Missing API version');
      }
      if (request.current === controller) {
        const version = String(discovery.api_major);
        setResult({key: 'settings.reachable', params: {version}});
        toast('positive', t('settings.reachable', {version}));
      }
    } catch (error) {
      if (request.current !== controller) return;
      let failure: Result;
      if (controller.signal.aborted && controller.signal.reason?.name === 'TimeoutError') failure = {key: 'settings.timeout'};
      else if (controller.signal.aborted) return;
      else if (error instanceof ApiError) {
        if (error.status === 401) failure = {key: 'settings.unauthorized'};
        else if (error.code === 'empty_response') failure = {key: 'settings.nonJson'};
        else if (error.code === 'invalid_discovery') failure = {key: 'settings.invalidResponse'};
        else failure = {key: 'settings.httpError', params: {status: error.status}};
      } else if (error instanceof SyntaxError) failure = {key: 'settings.nonJson'};
      // Fetch does not distinguish cross-origin network failures from CORS rejection.
      else if (error instanceof TypeError && new URL(base).origin !== location.origin) failure = {key: 'settings.cors'};
      else failure = {key: 'settings.network'};
      setResult({...failure, error: true, requestId: error instanceof ApiError ? error.requestId : null});
      // The failure is already named in the page language; the raw message (a DOMException, "Failed to fetch") is not.
      toast('negative', t(failure.key, failure.params));
    } finally {
      clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };

  const [dialog, showDialog] = useState<'add' | 'rename' | 'delete' | null>(null);
  // A dialog shows only what happens in it; a connection test from before is dropped.
  const setDialog = (next: typeof dialog) => {
    if (next) resetProbe();
    showDialog(next);
  };
  const [name, setName] = useState('');
  const confirmProfile = () => {
    if (dialog === 'delete') {
      const profiles = saved.profiles.filter(profile => profile.id !== active?.id);
      persist(profiles, profiles[0]?.id ?? '');
      return;
    }
    if (!name.trim()) return;
    // The saved profiles, not the form: an unsaved URL or token is written only by Save.
    if (dialog === 'add') {
      const profile = {id: uuid(), name: name.trim(), api: 'mock', token: ''};
      persist([...saved.profiles, profile], profile.id);
    } else {
      persist(
        saved.profiles.map(profile => (profile.id === active?.id ? {...profile, name: name.trim()} : profile)),
        saved.activeId
      );
    }
  };

  return {
    dialog,
    setDialog,
    name,
    setName,
    confirmProfile,
    saved,
    active,
    api,
    changeApi,
    token,
    changeToken,
    paired,
    dirty,
    invalid,
    result,
    pending,
    saving,
    save,
    switchProfile,
    confirmSwitch,
    switchPending: switchId !== null,
    cancelSwitch: () => setSwitchId(null),
    testConnection
  };
}
