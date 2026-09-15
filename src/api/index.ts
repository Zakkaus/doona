import type {Api} from './api';
import {createApi} from './client';
import {createMockApi} from './mock';

let selected: Api | undefined;
let configuration = '';
export function getApi(): Api {
  let base: string | null = null, token: string | null = null;
  try { base = localStorage.getItem('doona-api'); token = localStorage.getItem('doona-api-token'); } catch {}
  const key = JSON.stringify([base, token]);
  if (!selected || configuration !== key) {
    selected = base && base !== 'mock' ? createApi(base, token ?? undefined) : createMockApi();
    configuration = key;
  }
  return selected;
}
