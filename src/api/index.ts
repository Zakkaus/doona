import type {Api} from './api';
import {createApi} from './client';
import {createServerClock, selectServerClock} from './serverClock';
import {isDemoApi, pinnedProfile, storageRevision, touchStorage, type Profile} from './profiles';
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

// A password session kept in this browser takes the place of the profile's configured bearer.
const credential = (profile: Profile | undefined) => (profile?.api ? sessionToken(profile.id, profile.api) : null) ?? profile?.token;
// Whether this tab holds a bearer: a password session kept in this browser or the profile's configured one.
export const holdsCredential = () => !!credential(pinnedProfile());
// Whether this tab expects to be let in before the backend has answered: it holds a bearer, or it has no profile and
// runs the built-in demo, which asks for none. Read it after detectHostedBackend, which gives a hosted backend a profile.
export const expectsAccess = () => !pinnedProfile() || holdsCredential();

export function getApi(): Api {
  if (selected && checked === storageRevision()) return selected;
  // Another tab editing or deleting this tab's profile does not move this tab: it keeps that backend until it is reloaded.
  const profile = pinnedProfile();
  const base = profile?.api;
  const token = credential(profile);
  const key = JSON.stringify([profile?.id, base, token]);
  if (!selected || configuration !== key) {
    if (!isDemoApi(base)) {
      const clock = createServerClock();
      selected = createApi(base, token ?? undefined, clock);
      selectServerClock(clock);
    } else if (mockFactory) {
      // A saved demo profile asks for the demo account; the stored session is its bearer, as for a password backend.
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
