import {storageKeys} from '../api/storage';
export function readNavGroups(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKeys.navGroups) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export function saveNavGroups(ids: string[]) {
  try {
    localStorage.setItem(storageKeys.navGroups, JSON.stringify(ids));
  } catch {
    /* Retain this session's navigation state. */
  }
}
