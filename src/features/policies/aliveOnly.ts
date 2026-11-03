import {storageKeys} from '../../api/storage';
// Whether the node grids list only the available nodes. One choice for every group in this browser, since a reader who
// hides unavailable nodes wants that in each group they open.
export function readAliveOnly(): boolean {
  try {
    return localStorage.getItem(storageKeys.aliveOnly) === 'on';
  } catch {
    return false;
  }
}
export function saveAliveOnly(on: boolean) {
  try {
    if (on) localStorage.setItem(storageKeys.aliveOnly, 'on');
    else localStorage.removeItem(storageKeys.aliveOnly);
  } catch {
    /* Retain this session's choice. */
  }
}
