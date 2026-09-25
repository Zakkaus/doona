import {normalizeApi, touchStorage} from './profiles';
import {storageKeys} from './storage';

// A password session belongs to one tab: sessionStorage keeps it across a reload and drops it with the tab.
// It is bound to the profile and endpoint it was opened for, so switching either never sends it elsewhere.
type Stored = {profileId: string; api: string; token: string; expiresAt: string};
const KEY = storageKeys.session;

function read(): Stored | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const {profileId, api, token, expiresAt} = value as Partial<Stored>;
    return typeof profileId === 'string' && typeof api === 'string' && typeof token === 'string' && typeof expiresAt === 'string'
      ? {profileId, api, token, expiresAt}
      : null;
  } catch {
    return null;
  }
}

export function sessionToken(profileId: string, api: string, now = Date.now()): string | null {
  const stored = read();
  if (!stored || stored.profileId !== profileId || stored.api !== same(api)) return null;
  return Date.parse(stored.expiresAt) > now ? stored.token : null;
}
// When the session serving this profile and endpoint lapses; Infinity when none is still open.
export function sessionExpiry(profileId: string, api: string, now = Date.now()): number {
  const stored = read();
  const expiry = stored && stored.profileId === profileId && stored.api === same(api) ? Date.parse(stored.expiresAt) : NaN;
  return expiry > now ? expiry : Infinity;
}
const same = (api: string) => {
  try {
    return normalizeApi(api);
  } catch {
    return null;
  }
};

export function saveSession(profileId: string, api: string, token: string, expiresAt: string) {
  sessionStorage.setItem(KEY, JSON.stringify({profileId, api: normalizeApi(api), token, expiresAt} satisfies Stored));
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
  // An expired session counts too: it was open when the backend refused it.
  if (stored && stored.profileId === profileId && stored.api === same(api)) {
    clearSession();
    ended = true;
  }
  return ended;
}
