import {createRoot} from 'react-dom/client';
import {StrictMode} from 'react';
import '../fonts.css';
import './theme.css';
import {Shell} from './Shell';

createRoot(document.getElementById('root')!).render(<StrictMode><Shell /></StrictMode>);
