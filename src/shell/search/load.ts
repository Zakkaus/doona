import type {ComponentProps} from 'react';
import {preloadable} from '../../ui/preloadable';
import type {SearchDialog} from './SearchDialog';

// The search dialog stays out of the startup bundle. Hovering or focusing the search button starts loading it, so it
// has usually arrived by the time it opens; the shortcut loads it as it opens.
export const searchDialog = preloadable<ComponentProps<typeof SearchDialog>>(() => import('./SearchDialog').then(module => ({default: module.SearchDialog})));
export const preloadSearch = () => void searchDialog.preload().catch(() => undefined);
