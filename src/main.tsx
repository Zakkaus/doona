import {createRoot} from 'react-dom/client';
import {StrictMode, useEffect, useState} from 'react';
import './fonts.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';
import {detectHostedBackend} from './api/profiles';
import {initializeApi} from './api';
import {Loading, ErrorMessage} from './ui/ui';
import logo from './logo.svg';
import {toast} from './ui/ui';
import {readLang, translate} from './i18n';

stampAppearance();
let startup: Promise<unknown> | undefined;
function Startup() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let mounted = true;
    startup ??= detectHostedBackend().then(() => initializeApi());
    void startup.then(
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
  if (ready) return <Shell />;
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <div className="rp-brand">
          <img src={logo} alt="" />
          <span>doona</span>
        </div>
      </header>
      <main className="rp-main">
        <div className="rp-content">{error ? <ErrorMessage error={error} /> : <Loading />}</div>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Startup />
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  // A new build takes over an open tab silently; say so, since the page only changes on a reload.
  const running = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (running) toast('info', translate(readLang(), 'ui.newBuild'));
  });
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.error('Service worker registration failed:', error);
  });
}
