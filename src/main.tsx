import {createRoot} from 'react-dom/client';
import {StrictMode, useEffect, useState} from 'react';
import './fonts.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';
import {detectHostedBackend} from './api/profiles';
import {pruneRings} from './api/rings';
import {initializeApi, startedOnMock} from './api';
import {Loading, ErrorMessage} from './ui/ui';
import logo from './logo.svg';
import {toast} from './ui/ui';
import {LangContext, loadLanguage, loadedLang, readLang, translate, type Lang} from './i18n';
import {unloaded} from './i18n/unloaded';

stampAppearance();
// The saved language, or zh-TW when its catalogue cannot be fetched; rejects only when neither loads.
function startLanguage(): Promise<Lang> {
  const saved = readLang();
  return loadLanguage(saved).then(
    () => saved,
    error => (saved === 'zh-TW' ? Promise.reject(error) : loadLanguage('zh-TW').then(() => 'zh-TW' as const))
  );
}
let startup: Promise<unknown> | undefined;
const start = () =>
  (startup ??= detectHostedBackend().then(() => {
    pruneRings();
    return initializeApi();
  }));
let language: Promise<Lang> | undefined;
function Startup() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lang, setLang] = useState<Lang | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  useEffect(() => {
    let mounted = true;
    language ??= startLanguage();
    void language.then(
      loaded => {
        if (mounted) setLang(loaded);
      },
      () => {
        if (mounted) setUnreadable(true);
      }
    );
    void start().then(
      () => {
        if (mounted) setReady(true);
      },
      reason => {
        if (mounted) setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    );
    return () => {
      mounted = false;
    };
  }, []);
  if (ready && lang) return <Shell lang={lang} />;
  const [problem, retry] = unloaded[readLang()];
  return (
    <LangContext.Provider value={lang ?? 'zh-TW'}>
      <div className="rp-shell">
        <header className="rp-top">
          <div className="rp-brand">
            <img src={logo} alt="" />
            <span>doona</span>
          </div>
        </header>
        <main className="rp-main">
          <div className="rp-content">
            {unreadable ? (
              <div className="rp-empty" role="alert">
                <p>{problem}</p>
                <button type="button" className="rp-btn" onClick={() => location.reload()}>
                  {retry}
                </button>
              </div>
            ) : lang && error ? (
              <ErrorMessage error={error} onRetry={() => location.reload()} />
            ) : lang ? (
              <Loading />
            ) : null}
          </div>
        </main>
      </div>
    </LangContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Startup />
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  // A new build takes over an open tab silently; say so, since the page only changes on a reload.
  // clients.claim() fires controllerchange on first install too; only a replaced controller is a new build.
  const running = navigator.serviceWorker.controller !== null;
  // The worker installs no language or mock up front, so the page tells each active controller the language it shows
  // and whether it runs on the mock.
  const report = async () => {
    if (!(await (language ??= startLanguage()).catch(() => null))) return;
    await start().catch(() => null);
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    if (controller.state === 'activating') await new Promise<void>(resolve => controller.addEventListener('statechange', () => resolve(), {once: true}));
    if (controller.state === 'activated' && navigator.serviceWorker.controller === controller)
      controller.postMessage({language: loadedLang(readLang()), mock: startedOnMock()});
  };
  void navigator.serviceWorker.ready.then(report);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    void report();
    if (!running) return;
    toast('info', translate(loadedLang(readLang()), 'ui.newBuild'));
  });
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.error('Service worker registration failed:', error);
  });
}
