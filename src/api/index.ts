import type {Api} from './api';
import {createApi} from './client';
import {createMockApi} from './mock';
import {readProfiles} from './profiles';

let selected: Api | undefined;
let configuration = '';
export function getApi(): Api {
  const {profiles, activeId} = readProfiles();
  const profile = profiles.find(profile => profile.id === activeId);
  const base = profile?.api;
  const token = profile?.token;
  const key = JSON.stringify([activeId, base, token]);
  if (!selected || configuration !== key) {
    selected = base && base !== 'mock' ? createApi(base, token ?? undefined) : createMockApi();
    configuration = key;
  }
  return selected;
}
