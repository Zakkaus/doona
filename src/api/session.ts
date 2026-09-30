import {normalizeApi, touchStorage} from './profiles';
import {storageKeys} from './storage';

// A password session belongs to one tab: sessionStorage keeps it across a reload and drops it with the tab.
// It is bound to the profile and endpoint it was opened for, so switching either never sends it elsewhere. Its end is
// the backend's to judge: the browser clock can run hours off a router's, and the backend's 401 ends the session.
type Stored = {profileId: string; api: string; token: string};
const KEY = storageKeys.session;

function read(): Stored | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const {profileId, api, token} = value as Partial<Stored>;
    return typeof profileId === 'string' && typeof api === 'string' && typeof token === 'string' ? {profileId, api, token} : null;
  } catch {
    return null;
  }
}

export function sessionToken(profileId: string, api: string): string | null {
  const stored = read();
  return stored && stored.profileId === profileId && stored.api === same(api) ? stored.token : null;
}
const same = (api: string) => {
  try {
    return normalizeApi(api);
  } catch {
    return null;
  }
};

export function saveSession(profileId: string, api: string, token: string) {
  sessionStorage.setItem(KEY, JSON.stringify({profileId, api: normalizeApi(api), token} satisfies Stored));
  touchStorage();
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
    touchStorage();
  } catch {
    // Unavailable storage holds no session to clear.
  }
}

// The backend refused this tab's session: it is dropped once, and the page remembers that it ended until the next
// load, however often the sign-in screen mounts in between.
let ended = false;
export function endSession(profileId: string, api: string): boolean {
  const stored = read();
  if (stored && stored.profileId === profileId && stored.api === same(api)) {
    clearSession();
    ended = true;
  }
  return ended;
}
