import {createRoot} from 'react-dom/client';
import {StrictMode} from 'react';
import './fonts.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';
import {detectHostedBackend} from './api/profiles';
import {toast} from './ui/ui';
import {readLang, translate} from './i18n';

stampAppearance();
// One discovery request on a first visit, so a copy hosted by the backend opens against it.
void detectHostedBackend().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Shell />
    </StrictMode>
  );
});

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
