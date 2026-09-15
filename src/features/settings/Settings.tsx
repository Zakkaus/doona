import {createContext, useContext, useEffect, useRef, useState} from 'react';
import {Button as RButton, Input, Label, Text, TextField} from 'react-aria-components';
import {LANGS, useT, type Lang, type Params} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {ApiError, createApi} from '../../api/client';
import {Button, Kv, LabeledSelect, MenuButton, Segmented} from '../../ui/ui';
import {normalizeApi, readSettings, writeSettings, type BackendKind, type PaletteId, type Scheme, type Wordmark} from './settings';

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

type Result = {key: Key; params?: Params; error?: boolean};

export function Settings() {
  const t = useT();
  const controls = useContext(SettingsContext);
  const [saved] = useState(readSettings);
  const [api, setApi] = useState(saved.api ?? '');
  const [token, setToken] = useState(saved.token);
  const [backend, setBackend] = useState(saved.backend);
  const [showToken, setShowToken] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
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
  const save = () => {
    const base = validate(api);
    if (base === null) return;
    try {
      writeSettings({api: base, token, backend});
    } catch {
      setResult({key: 'settings.saveError', error: true});
      return;
    }
    // Rebuild requests, SSE subscriptions, and module-level observation state for the new backend.
    location.reload();
  };
  const testConnection = async () => {
    resetProbe();
    const base = validate(api);
    if (base === null) return;
    if (!base || base === 'mock') {
      setResult({key: 'settings.demo'});
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('Connection timeout', 'TimeoutError')), 5000);
    setPending(true);
    try {
      if (backend === 'native') {
        const discovery = await createApi(base, token).discovery(controller.signal);
        if (!discovery || !Number.isInteger(discovery.api_major) || discovery.api_major < 1) {
          throw new ApiError(200, 'invalid_discovery', 'Missing API version');
        }
        if (request.current === controller) setResult({key: 'settings.reachable', params: {version: discovery.api_major}});
      } else {
        const headers: Record<string, string> = {Accept: 'application/json'};
        if (token) headers.Authorization = 'Bearer ' + token;
        const response = await fetch(base + '/version', {headers, signal: controller.signal, cache: 'no-store'});
        if (!response.ok) throw new ApiError(response.status, 'http_error', 'Clash request failed');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('version' in data) || typeof data.version !== 'string' || !data.version.trim()) {
          throw new ApiError(200, 'invalid_discovery', 'Missing Clash version');
        }
        if (request.current === controller) setResult({key: 'settings.clashReachable', params: {version: data.version}});
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
      setResult({...failure, error: true});
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
      <section className="rp-card" aria-labelledby="settings-backend">
        <h2 className="rp-h3" id="settings-backend">
          {t('settings.backend')}
        </h2>
        <form
          className="rp-form"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
        >
          <div className="rp-field">
            <span className="lbl">{t('settings.kind')}</span>
            <input type="hidden" name="backend" value={backend} />
            <Segmented
              label={t('settings.kind')}
              value={backend}
              items={[
                ['native', t('settings.native')],
                ['clash', t('settings.clash')]
              ]}
              onChange={value => {
                setBackend(value as BackendKind);
                resetProbe();
              }}
            />
          </div>
          <TextField
            className="rp-field"
            name="api"
            value={api}
            isInvalid={invalid}
            validationBehavior="aria"
            onChange={value => {
              setApi(value);
              validate(value);
              resetProbe();
            }}
          >
            <Label>{t('settings.api')}</Label>
            <span className="rp-input">
              <Input autoComplete="url" spellCheck={false} aria-describedby={invalid ? 'settings-url-error' : undefined} />
            </span>
            <Text slot="description" className="rp-label">
              {t('settings.apiHelp')}
            </Text>
            {invalid && (
              <span id="settings-url-error" role="alert">
                {t('settings.invalidUrl')}
              </span>
            )}
          </TextField>
          <TextField
            className="rp-field"
            name="token"
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={value => {
              setToken(value);
              resetProbe();
            }}
          >
            <Label>{t('settings.token')}</Label>
            <div className="rp-settings-secret">
              <span className="rp-input">
                <Input autoComplete="off" spellCheck={false} />
              </span>
              <Button onPress={() => setShowToken(value => !value)}>{t(showToken ? 'settings.hideToken' : 'settings.showToken')}</Button>
            </div>
          </TextField>
          <div className="rp-toolbar">
            <Button onPress={() => void testConnection()} isDisabled={pending}>
              {t('settings.test')}
            </Button>
            <RButton type="submit" className="rp-btn accent">
              {t('settings.save')}
            </RButton>
          </div>
          <div className="rp-label">{t('settings.saveHelp')}</div>
          {pending && <div role="status">{t('settings.testing')}</div>}
          {result && <div role={result.error ? 'alert' : 'status'}>{t(result.key, result.params)}</div>}
        </form>
      </section>
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
            [t('settings.contract'), import.meta.env.VITE_DOONA_CONTRACT_COMMIT]
          ]}
        />
        <a href="https://github.com/Zakkaus/doona" target="_blank" rel="noreferrer">
          {t('github')}
        </a>
      </section>
    </div>
  );
}
