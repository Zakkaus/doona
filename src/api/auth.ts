import type {components} from './types';
import {LocalError, responseError, send} from './error';
import {isDemoApi} from './profiles';

// Sign-in reads only what the public discovery view carries; the admitted view's auth adds anonymous_loopback.
export type AuthDiscovery = components['schemas']['PublicDiscovery']['auth'];
export type AuthCredentials = components['schemas']['AuthCredentials'];
export type AuthSession = components['schemas']['AuthSession'];
// What the sign-in screen offers: an administrator to create, credentials to check, or a bearer to paste.
export type SignIn = 'setup' | 'login' | 'token';

const url = (base: string, path: string) => new URL(base.replace(/\/+$/, '') + path, globalThis.location?.href);

// The demo backend signs in through the in-browser mock, loaded only when that backend is asked. Its one account is
// published on the sign-in page, so it guards nothing.
const demoAuth = () => import('./mock/auth');
export const DEMO_ACCOUNT = {username: 'demo', password: 'demo'} as const;

// Discovery is public, so it is read without a token. An engine that still reports the old API name serves an API
// older than this doona, which it cannot sign in to.
export async function discoverAuth(base: string, signal?: AbortSignal): Promise<AuthDiscovery> {
  if (isDemoApi(base)) return (await demoAuth()).mockDiscovery();
  const response = await send(url(base, '/api'), {headers: {Accept: 'application/json'}, cache: 'no-store', signal});
  if (!response.ok) throw await responseError(response);
  const body: {name?: string; auth: AuthDiscovery} = await response.json();
  if (body.name === 'dae/honk-native') throw new LocalError('login.engineOutdated');
  return body.auth;
}

// A backend without discovery may still serve the native API; only a 404 from its capabilities says it does not.
export async function servesNativeApi(base: string, signal?: AbortSignal): Promise<boolean> {
  const response = await send(url(base, '/api/v1/capabilities'), {headers: {Accept: 'application/json'}, cache: 'no-store', signal});
  return response.status !== 404;
}

export function signInKind(auth: AuthDiscovery): SignIn {
  if (auth.mode !== 'password') return 'token';
  return auth.setup_required ? 'setup' : 'login';
}

// Setup and login carry no Authorization: a stale token from an earlier session would be refused as invalid. Only
// setup changes what the backend holds: a login that timed out is simply tried again, so it keeps the read wording.
export async function openSession(base: string, kind: 'setup' | 'login', credentials: AuthCredentials, signal?: AbortSignal): Promise<AuthSession> {
  if (isDemoApi(base)) return (await demoAuth()).mockOpenSession(kind, credentials);
  const response = await send(
    url(base, `/api/v1/auth/${kind}`),
    {
      method: 'POST',
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: JSON.stringify(credentials),
      cache: 'no-store',
      signal
    },
    kind === 'setup'
  );
  if (!response.ok) throw await responseError(response, 'POST');
  return response.json();
}

export async function closeSession(base: string, token: string, signal?: AbortSignal): Promise<void> {
  // The demo keeps no sessions to revoke; dropping the tab's token ends it.
  if (isDemoApi(base)) return;
  const response = await send(url(base, '/api/v1/auth/logout'), {
    method: 'POST',
    headers: {Accept: 'application/json', Authorization: 'Bearer ' + token},
    cache: 'no-store',
    signal
  });
  // An already-ended session is the outcome logout asked for.
  if (!response.ok && response.status !== 401) throw await responseError(response, 'POST');
}
