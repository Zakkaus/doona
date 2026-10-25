import type {ComponentProps} from 'react';
import {withCatalogue} from '../../i18n';
import {preloadable} from '../../ui/preloadable';
import type {SearchDialog} from './SearchDialog';

// The search dialog stays out of the startup bundle. The idle warm-up, a held Ctrl or ⌘, and hovering or focusing the
// search button load it ahead; it opens only once loaded.
export const searchDialog = preloadable<ComponentProps<typeof SearchDialog>>(
  // Search matches the labels of every page, so it loads their messages too.
  withCatalogue('rest', () => import('./SearchDialog').then(module => ({default: module.SearchDialog})))
);
export const preloadSearch = () => void searchDialog.preload().catch(() => undefined);
