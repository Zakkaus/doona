import type {Api} from './api';
import {createApi} from './client';
import {createServerClock, selectServerClock} from './serverClock';
import {isDemoApi, pinnedProfile, storageRevision, touchStorage} from './profiles';
import {sessionToken} from './session';

let selected: Api | undefined;
let configuration = '';
let mockFactory: typeof import('../../mock').createMockApi | undefined;
// Every store hook asks for the client on every render; storage is read again only once something may have changed it.
let checked = -1;
if (typeof window !== 'undefined') window.addEventListener('storage', touchStorage);

export async function initializeApi(): Promise<Api> {
  const base = pinnedProfile()?.api;
  if (isDemoApi(base)) mockFactory = (await import('../../mock')).createMockApi;
  return getApi();
}

// Whether this page loaded the mock backend at startup, so the service worker keeps it for offline use.
export const startedOnMock = () => mockFactory !== undefined;

export function getApi(): Api {
  if (selected && checked === storageRevision()) return selected;
  // Another tab editing or deleting this tab's profile does not move this tab: it keeps that backend until it is reloaded.
  const profile = pinnedProfile();
  const base = profile?.api;
  // A password session opened in this tab takes the place of the profile's configured bearer.
  const token = (profile && base ? sessionToken(profile.id, base) : null) ?? profile?.token;
  const key = JSON.stringify([profile?.id, base, token]);
  if (!selected || configuration !== key) {
    if (!isDemoApi(base)) {
      const clock = createServerClock();
      selected = createApi(base, token ?? undefined, clock);
      selectServerClock(clock);
    } else if (mockFactory) {
      // A saved demo profile asks for the demo account; the tab's session is its bearer, as for a password backend.
      selected = mockFactory(profile ? {signIn: true, session: token ?? null} : undefined);
      selectServerClock(createServerClock());
    } else if (selected) {
      // This tab saved the mock and reloads: keep serving the current backend until the mock has loaded.
      void import('../../mock').then(module => {
        mockFactory = module.createMockApi;
      });
      return selected;
    } else throw new Error('API initialization has not completed');
    configuration = key;
  }
  checked = storageRevision();
  return selected;
}
