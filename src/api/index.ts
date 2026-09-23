import type {Api} from './api';
import {createApi} from './client';
import {readProfiles, storageRevision, touchStorage} from './profiles';
import {sessionExpiry, sessionToken} from './session';

let selected: Api | undefined;
let configuration = '';
let pinned: string | undefined;
let mockFactory: (() => Api) | undefined;
// Every store hook asks for the client on every render; storage is read again only once something may have changed
// it, or once the session it was built with has lapsed.
let checked = {revision: -1, until: 0};
if (typeof window !== 'undefined') window.addEventListener('storage', touchStorage);

export async function initializeApi(): Promise<Api> {
  const {profiles, activeId} = readProfiles();
  const base = profiles.find(profile => profile.id === activeId)?.api;
  if (!base || base === 'mock') mockFactory = (await import('./mock')).createMockApi;
  return getApi();
}

export function getApi(): Api {
  if (selected && checked.revision === storageRevision() && Date.now() < checked.until) return selected;
  const {profiles, activeId} = readProfiles();
  // Another tab deleting this tab's profile does not move this tab: it keeps that backend until it is reloaded.
  if (selected && pinned && !profiles.some(profile => profile.id === pinned)) {
    checked = {revision: storageRevision(), until: Infinity};
    return selected;
  }
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
    pinned = profile?.id;
  }
  checked = {revision: storageRevision(), until: profile && base ? sessionExpiry(profile.id, base) : Infinity};
  return selected;
}
