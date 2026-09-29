import {createRoot} from 'react-dom/client';
import {StrictMode, useEffect, useState} from 'react';
import './fonts.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';
import {detectHostedBackend} from './api/profiles';
import {pruneRings} from './api/rings';
import {initializeApi, startedOnMock} from './api';
import {Button, Empty, Loading, ErrorMessage} from './ui/ui';
import logo from './logo.svg';
import {toast} from './ui/ui';
import {DEFAULT_LANG, LangContext, loadLanguage, loadedLang, readLang, translate, type Lang} from './i18n';
import {unloaded} from './i18n/unloaded';
import {reloadForStaleChunk} from './ui/staleChunk';

stampAppearance();
// The saved language, or the default when its catalogue cannot be fetched; rejects only when neither loads.
function startLanguage(): Promise<Lang> {
  const saved = readLang();
  return loadLanguage(saved).then(
    () => saved,
    error => (saved === DEFAULT_LANG ? Promise.reject(error) : loadLanguage(DEFAULT_LANG).then(() => DEFAULT_LANG))
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
  const [problem, retry] = unloaded(readLang());
  return (
    <LangContext.Provider value={lang ?? DEFAULT_LANG}>
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
              <Empty role="alert">
                <p>{problem}</p>
                <Button onPress={() => location.reload()}>{retry}</Button>
              </Empty>
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
// Vite raises this when a lazy chunk or its stylesheet cannot be fetched, before the import rejects. A reload here
// does not cancel the rejection: the page's LoadBoundary still sees it and knows the reload is under way.
window.addEventListener('vite:preloadError', () => void reloadForStaleChunk());
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
    const lang = loadedLang(readLang());
    toast('info', translate(lang, 'ui.newBuild'), {action: {label: translate(lang, 'ui.reloadPage'), onAction: () => location.reload()}});
  });
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.error('Service worker registration failed:', error);
  });
}
