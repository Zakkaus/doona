import {createRoot} from 'react-dom/client';
import {StrictMode} from 'react';
import './fonts.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';
import {detectHostedBackend} from './features/settings/settings';

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
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.error('Service worker registration failed:', error);
  });
}
