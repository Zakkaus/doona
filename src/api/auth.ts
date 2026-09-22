import type {components} from './types';
import {responseError} from './error';

export type AuthDiscovery = components['schemas']['AuthDiscovery'];
export type AuthCredentials = components['schemas']['AuthCredentials'];
export type AuthSession = components['schemas']['AuthSession'];
// What the sign-in screen offers: an administrator to create, credentials to check, or a bearer to paste.
export type SignIn = 'setup' | 'login' | 'token';

const url = (base: string, path: string) => new URL(base.replace(/\/+$/, '') + path, globalThis.location?.href);

// Discovery is public, so it is read without a token; a backend that predates password login has no `auth`.
export async function discoverAuth(base: string, signal?: AbortSignal): Promise<AuthDiscovery | null> {
  const response = await fetch(url(base, '/api'), {headers: {Accept: 'application/json'}, cache: 'no-store', signal});
  if (!response.ok) throw await responseError(response);
  const body: {auth?: AuthDiscovery} = await response.json();
  return body.auth ?? null;
}

export function signInKind(auth: AuthDiscovery | null): SignIn {
  if (auth?.mode !== 'password') return 'token';
  return auth.setup_required ? 'setup' : 'login';
}

// Setup and login carry no Authorization: a stale token from an earlier session would be refused as invalid.
export async function openSession(base: string, kind: 'setup' | 'login', credentials: AuthCredentials, signal?: AbortSignal): Promise<AuthSession> {
  const response = await fetch(url(base, `/api/v1/auth/${kind}`), {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify(credentials),
    cache: 'no-store',
    signal
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function closeSession(base: string, token: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(url(base, '/api/v1/auth/logout'), {
    method: 'POST',
    headers: {Accept: 'application/json', Authorization: 'Bearer ' + token},
    cache: 'no-store',
    signal
  });
  // An already-ended session is the outcome logout asked for.
  if (!response.ok && response.status !== 401) throw await responseError(response);
}
