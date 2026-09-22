import {normalizeApi} from './profiles';

// A password session belongs to one tab: sessionStorage keeps it across a reload and drops it with the tab.
// It is bound to the profile and endpoint it was opened for, so switching either never sends it elsewhere.
type Stored = {profileId: string; api: string; token: string; expiresAt: string};
const KEY = 'doona-session';

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
const same = (api: string) => {
  try {
    return normalizeApi(api);
  } catch {
    return null;
  }
};

export function saveSession(profileId: string, api: string, token: string, expiresAt: string) {
  sessionStorage.setItem(KEY, JSON.stringify({profileId, api: normalizeApi(api), token, expiresAt} satisfies Stored));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Unavailable storage holds no session to clear.
  }
}

// The backend refused this tab's session: it is dropped once, and the page remembers that it ended until the next
// load, however often the sign-in screen mounts in between.
let ended = false;
export function endSession(profileId: string, api: string): boolean {
  if (sessionToken(profileId, api) !== null) {
    clearSession();
    ended = true;
  }
  return ended;
}
