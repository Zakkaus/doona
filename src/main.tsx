import {createRoot} from 'react-dom/client';
import {StrictMode} from 'react';
import './fonts.css';
import './ui/theme.css';
import {Shell, stampAppearance} from './shell/Shell';

stampAppearance();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>
);
