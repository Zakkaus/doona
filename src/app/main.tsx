import {createRoot} from 'react-dom/client';
import {StrictMode} from 'react';
import '@react-spectrum/s2/page.css';
import '../fonts.css';
import '../base.css';
import {Shell} from './Shell';

createRoot(document.getElementById('root')!).render(<StrictMode><Shell /></StrictMode>);
