import type {Api} from './api';
import {createApi} from './client';
import {readProfiles} from './profiles';
import {sessionToken} from './session';

let selected: Api | undefined;
let configuration = '';
let mockFactory: (() => Api) | undefined;

export async function initializeApi(): Promise<Api> {
  const {profiles, activeId} = readProfiles();
  const base = profiles.find(profile => profile.id === activeId)?.api;
  if (!base || base === 'mock') mockFactory = (await import('./mock')).createMockApi;
  return getApi();
}

export function getApi(): Api {
  const {profiles, activeId} = readProfiles();
  const profile = profiles.find(profile => profile.id === activeId);
  const base = profile?.api;
  // A password session opened in this tab takes the place of the profile's configured bearer.
  const token = (profile && base ? sessionToken(profile.id, base) : null) ?? profile?.token;
  const key = JSON.stringify([activeId, base, token]);
  if (!selected || configuration !== key) {
    if (base && base !== 'mock') selected = createApi(base, token ?? undefined);
    else if (mockFactory) selected = mockFactory();
    else if (selected) {
      // Switched to the mock from another tab: keep serving the current backend until the mock has loaded.
      void import('./mock').then(module => {
        mockFactory = module.createMockApi;
      });
      return selected;
    } else throw new Error('API initialization has not completed');
    configuration = key;
  }
  return selected;
}
