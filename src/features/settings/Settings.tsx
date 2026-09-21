import {createContext, useContext, useEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import GitHub from '../../ui/icons/GitHub';
import {useCapabilities, useVersion} from '../../api/store';
import {LANGS, useT, type Lang, type Params} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {createApi} from '../../api/client';
import {uuid} from '../../api/hash';
import {ApiError} from '../../api/error';
import {Button, ErrorMessage, Kv, LabeledSelect, Light, MenuButton, ModalDialog, TextField, errorText, toast} from '../../ui/ui';
import {normalizeApi, writeProfiles, type Profile} from '../../api/profiles';
import {readSettings, type PaletteId, type Scheme, type Wordmark} from './settings';
import {RuntimeSettingsCard} from './RuntimeSettings';
import {BackendActionsCard} from './BackendActions';
import {useInstallOffer} from '../../shell/install';
import type {PageProps} from '../types';

type Appearance = {
  scheme: Scheme;
  dark: boolean;
  toggle: () => void;
  palette: PaletteId;
  pickPalette: (value: PaletteId) => void;
  wordmark: Wordmark;
  pickWordmark: (value: Wordmark) => void;
};
export const SettingsContext = createContext<{
  lang: Lang;
  pickLang: (value: Lang) => void;
  ap: Appearance;
  paletteSections: Array<{title: string; items: Array<{id: PaletteId; label: string; desc?: string}>}>;
} | null>(null);

type Result = {key: Key; params?: Params; error?: boolean; requestId?: string | null};

// `#/settings?api=<base>&token=<token>` fills the backend form so one link pairs a device; nothing is saved
// until the person presses Save, and the address bar is scrubbed so the token is not left in history.
function readPairing(query: string): {api: string; token: string} | null {
  const params = new URLSearchParams(query);
  const api = params.get('api');
  return api ? {api, token: params.get('token') ?? ''} : null;
}

export function Settings({query}: PageProps) {
  const t = useT();
  const install = useInstallOffer();
  const capabilities = useCapabilities();
  const version = useVersion();
  const controls = useContext(SettingsContext);
  const [saved] = useState(readSettings);
  const [api, setApi] = useState(saved.api ?? '');
  const [token, setToken] = useState(saved.token);
  const [paired, setPaired] = useState(false);
  // The query is read whenever it changes, so links work while the page is already open: a pairing link fills
  // the form during render, the address bar and the card scroll follow in an effect.
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  if (lastQuery !== query) {
    setLastQuery(query);
    const pair = readPairing(query);
    if (pair) {
      setPaired(true);
      setApi(pair.api);
      setToken(pair.token);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(query);
    if (params.has('api')) {
      params.delete('api');
      params.delete('token');
      history.replaceState(null, '', location.pathname + location.search + '#/settings' + (params.size ? '?' + params : ''));
    }
    const card = params.get('card');
    if (card) document.getElementById('settings-' + card)?.scrollIntoView({block: 'start'});
  }, [query]);
  const active = saved.profiles.find(profile => profile.id === saved.activeId);
  const [dialog, setDialog] = useState<'add' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  if (!controls) throw new Error('Settings requires shell controls');
  const {lang, pickLang, ap, paletteSections} = controls;
  const resetProbe = () => {
    request.current?.abort();
    request.current = null;
    setPending(false);
    setResult(null);
  };
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
  const save = (id?: string) => {
    const profiles = editedProfiles();
    if (profiles) persist(profiles, id ?? active?.id ?? profiles[0].id);
    else toast('negative', t('settings.invalidUrl'));
  };
  const confirmProfile = () => {
    if (dialog === 'delete') {
      const profiles = saved.profiles.filter(profile => profile.id !== active?.id);
      persist(profiles, profiles[0]?.id ?? '');
      return;
    }
    const profiles = dialog === 'add' && !active ? [] : editedProfiles();
    if (!profiles) {
      setDialog(null);
      toast('negative', t('settings.invalidUrl'));
      return;
    }
    if (!name.trim()) return;
    if (dialog === 'add') {
      const profile = {id: uuid(), name: name.trim(), api: 'mock', token: ''};
      persist([...profiles, profile], profile.id);
    } else {
      persist(
        profiles.map(profile => (profile.id === active?.id ? {...profile, name: name.trim()} : profile)),
        saved.activeId
      );
    }
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
        setResult({key: 'settings.reachable', params: {version: discovery.api_major}});
        toast('positive', t('settings.reachable', {version: discovery.api_major}));
      }
    } catch (error) {
      if (request.current !== controller) return;
      let failure: Result;
      if (controller.signal.aborted) failure = {key: 'settings.timeout'};
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
      toast('negative', `${t(failure.key, failure.params)} · ${errorText(error)}`);
    } finally {
      clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return (
    <div className="rp-col">
      {saved.api === null && <div className="rp-label">{t('settings.firstRun')}</div>}
      {paired && <div className="rp-label">{t('settings.paired')}</div>}
      <section className="rp-card" aria-labelledby="settings-backend">
        <h2 className="rp-h3" id="settings-backend">
          {t('settings.backend')}
        </h2>
        <ErrorMessage error={capabilities.error} />
        <div className="rp-toolbar">
          <LabeledSelect
            label={t('settings.profile')}
            side
            value={saved.activeId}
            isDisabled={!active}
            items={saved.profiles.map(profile => ({id: profile.id, label: profile.name}))}
            onChange={save}
          />
          <Button
            onPress={() => {
              setName('');
              setDialog('add');
            }}
          >
            {t('settings.addProfile')}
          </Button>
          <Button
            isDisabled={!active}
            onPress={() => {
              setName(active?.name ?? '');
              setDialog('rename');
            }}
          >
            {t('settings.renameProfile')}
          </Button>
          <Button isDisabled={!active} onPress={() => setDialog('delete')}>
            {t('settings.deleteProfile')}
          </Button>
        </div>
        <form
          className="rp-form"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            label={t('settings.api')}
            autoComplete="url"
            spellCheck={false}
            description={t('settings.apiHelp')}
            error={invalid ? t('settings.invalidUrl') : undefined}
            name="api"
            value={api}
            isInvalid={invalid}
            validationBehavior="aria"
            onChange={value => {
              setApi(value);
              validate(value);
              resetProbe();
            }}
          />
          <TextField
            label={t('settings.token')}
            autoComplete="off"
            spellCheck={false}
            action={<Button onPress={() => setShowToken(value => !value)}>{t(showToken ? 'settings.hideToken' : 'settings.showToken')}</Button>}
            name="token"
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={value => {
              setToken(value);
              resetProbe();
            }}
          />
          <div className="rp-toolbar">
            <Button onPress={() => void testConnection()} isPending={pending} isDisabled={saving}>
              {t('settings.test')}
            </Button>
            <Button type="submit" accent isPending={saving}>
              {t('settings.save')}
            </Button>
          </div>
          <div className="rp-label">{t('settings.saveHelp')}</div>
          {pending && <div role="status">{t('settings.testing')}</div>}
          {result && (
            <div role={result.error ? 'alert' : 'status'}>
              {t(result.key, result.params)}
              {result.requestId && <span className="rp-code"> · request_id: {result.requestId}</span>}
            </div>
          )}
        </form>
      </section>
      <RuntimeSettingsCard />
      <BackendActionsCard />
      <section className="rp-card" aria-labelledby="settings-appearance">
        <h2 className="rp-h3" id="settings-appearance">
          {t('settings.appearance')}
        </h2>
        <div className="rp-toolbar">
          <LabeledSelect label={t('lang')} value={lang} onChange={value => pickLang(value as Lang)} items={LANGS.map(([id, label]) => ({id, label}))} />
          <div className="rp-field">
            <span className="lbl">{t('palette')}</span>
            <MenuButton label={t('palette')} value={ap.palette} onChange={value => ap.pickPalette(value as PaletteId)} sections={paletteSections}>
              {paletteSections.find(section => section.items.some(item => item.id === ap.palette))?.items.find(item => item.id === ap.palette)?.label ??
                ap.palette}
            </MenuButton>
          </div>
          <div className="rp-field">
            <span className="lbl">{t('settings.scheme')}</span>
            <Button onPress={ap.toggle}>{t(ap.scheme === 'system' ? 'theme.system' : ap.dark ? 'theme.dark' : 'theme.light')}</Button>
          </div>
          <LabeledSelect
            label={t('wordmark')}
            value={ap.wordmark}
            onChange={value => ap.pickWordmark(value as Wordmark)}
            items={[
              {id: 'gradient', label: t('wordmark.gradient')},
              {id: 'plain', label: t('wordmark.plain')}
            ]}
          />
        </div>
      </section>
      <section className="rp-card" aria-labelledby="settings-about">
        <h2 className="rp-h3" id="settings-about">
          {t('settings.about')}
        </h2>
        <Kv
          items={[
            [t('settings.version'), import.meta.env.VITE_DOONA_VERSION],
            [t('settings.contract'), import.meta.env.VITE_DOONA_CONTRACT_COMMIT],
            ...(version.data
              ? [
                  [
                    t('settings.engine'),
                    `${version.data.engine.name} ${version.data.engine.version} · API ${version.data.api.major} (${version.data.api.status})`
                  ] as [string, string]
                ]
              : [])
          ]}
        />
        {version.data && version.data.api.major !== 1 && (
          <Light small tone="warn">
            {t('settings.apiMajor', {major: String(version.data.api.major)})}
          </Light>
        )}
        <div className="rp-cluster">
          <Button onPress={() => window.open(import.meta.env.VITE_DOONA_REPO, '_blank', 'noreferrer')}>
            <GitHub />
            {t('github')}
          </Button>
          {install && (
            <Button
              onPress={() => {
                void install().then(accepted => {
                  if (accepted) toast('positive', t('settings.installed'));
                });
              }}
            >
              {t('settings.install')}
            </Button>
          )}
        </div>
      </section>
      {dialog && (
        <ModalDialog
          title={t(dialog === 'add' ? 'settings.addProfile' : dialog === 'rename' ? 'settings.renameProfile' : 'settings.deleteProfile')}
          isOpen
          narrow
          alert={dialog === 'delete'}
          onOpenChange={open => {
            if (!open) setDialog(null);
          }}
          footer={() => (
            <>
              <Button onPress={() => setDialog(null)}>{t('ui.cancel')}</Button>
              <Button accent={dialog !== 'delete'} negative={dialog === 'delete'} isDisabled={dialog !== 'delete' && !name.trim()} onPress={confirmProfile}>
                {t(dialog === 'delete' ? 'settings.deleteProfile' : 'settings.save')}
              </Button>
            </>
          )}
        >
          {dialog === 'delete' ? (
            <p>{t('settings.deleteProfileHelp', {name: active?.name ?? ''})}</p>
          ) : (
            <TextField label={t('settings.profileName')} value={name} onChange={setName} />
          )}
          {result?.error && <p role="alert">{t(result.key, result.params)}</p>}
        </ModalDialog>
      )}
    </div>
  );
}
