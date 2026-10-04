import {createRoot} from 'react-dom/client';
import {StrictMode, useEffect, useLayoutEffect, useState} from 'react';
import './ui/flags.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';
import {detectHostedBackend} from './api/profiles';
import {pruneRings} from './store/rings';
import {expectsAccess, initializeApi, startedOnMock} from './api';
import {preloadActivity} from './shell/registry';
import {Button, Empty, ErrorMessage, PageSkeleton} from './ui/ui';
import logo from './logo.svg';
import {toast} from './ui/ui';
import {activated, announceBuild} from './shell/newBuild';
import {DEFAULT_LANG, FONT, LangContext, LOCALE, loadLanguage, loadedLang, pageDirection, readLang, translate, type Lang} from './i18n';
import startupText from 'virtual:startup-text';
import {loadFaces} from './fonts';

stampAppearance();
// The font archive check starts now, so it overlaps the catalogue fetch the language load waits on.
void loadFaces(null);
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
    if (expectsAccess()) preloadActivity();
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
  // The language on screen: the loaded catalogue's, which is the default when the saved one failed, or the saved one
  // when none loaded and the failure screen shows its startup text.
  const shown = lang ?? readLang();
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.lang = LOCALE[shown];
    html.style.setProperty('--rp-font-family', FONT[shown]);
    html.dir = pageDirection(LOCALE[shown], html.hasAttribute('data-mirror'));
  }, [shown]);
  if (ready && lang) return <Shell lang={lang} />;
  const [problem, retry] = startupText[shown];
  return (
    <LangContext.Provider value={shown}>
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
              <PageSkeleton />
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
  // A new build takes over an open tab silently; say so, since the page only changes on a reload. An online load
  // already fetches the new build's page while the old worker still controls it, so only a worker whose build differs
  // from the page's is news. clients.claim() fires controllerchange on first install too, which stays silent.
  const running = navigator.serviceWorker.controller !== null;
  const build = document.querySelector<HTMLMetaElement>('meta[name="doona-build"]')?.content;
  // The worker installs no language or mock up front, so the page tells each active controller the language it shows
  // and whether it runs on the mock.
  const report = async () => {
    if (!(await (language ??= startLanguage()).catch(() => null))) return;
    await start().catch(() => null);
    const controller = navigator.serviceWorker.controller;
    if (controller && (await activated(controller, navigator.serviceWorker))) controller.postMessage({language: loadedLang(readLang()), mock: startedOnMock()});
  };
  void navigator.serviceWorker.ready.then(report);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    void report();
    const controller = navigator.serviceWorker.controller;
    if (!running || !controller) return;
    // The new build can take over while the page's catalogue is still loading, so the notice waits for it. When no
    // catalogue loads, the page already offers its own reload.
    void announceBuild(
      controller,
      navigator.serviceWorker,
      build,
      () => (language ??= startLanguage()),
      () => {
        const lang = loadedLang(readLang());
        toast('info', translate(lang, 'ui.newBuild'), {action: {label: translate(lang, 'ui.reloadPage'), onAction: () => location.reload()}});
      }
    ).catch(() => undefined);
  });
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.error('Service worker registration failed:', error);
  });
}
