import {storageKeys} from '../../api/storage';
import {defaults, parseLayout, type Layout} from './layout';
import {storedLayout} from './storedLayout';
const store = storedLayout(storageKeys.widgets, parseLayout, defaults);
export const readLayout = store.read;
export const saveLayout = store.save;
export const useWidgetLayout = store.useLayout;
export const patchLayout = (value: Partial<Layout>) => saveLayout(previous => ({...previous, ...value}));
