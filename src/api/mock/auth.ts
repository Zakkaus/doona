import type {Api} from '../api';
import type {AuthCredentials, AuthDiscovery, AuthSession} from '../auth';
import {ApiError} from '../error';

// The demo backend's one account. It is published on the sign-in page, so it guards nothing.
export const DEMO_ACCOUNT = {username: 'demo', password: 'demo'} as const;
const PREFIX = 'demo-session-';
const LIFETIME = 12 * 3600_000;

// The demo answers discovery the way a password backend does once its administrator exists.
export function mockDiscovery(): AuthDiscovery {
  return {mode: 'password', setup_required: false};
}

export function mockOpenSession(kind: 'setup' | 'login', credentials: AuthCredentials): AuthSession {
  if (kind === 'setup') throw new ApiError(409, 'setup_already_completed', 'Setup already completed');
  if (credentials.username !== DEMO_ACCOUNT.username || credentials.password !== DEMO_ACCOUNT.password)
    throw new ApiError(401, 'invalid_credentials', 'Invalid credentials');
  return {token: PREFIX + crypto.randomUUID(), expires_at: new Date(Date.now() + LIFETIME).toISOString()};
}

// The mock keeps no server state across reloads, so any session it issued is accepted by its form.
export function mockSessionValid(token: string | null | undefined): boolean {
  return !!token?.startsWith(PREFIX);
}

// Without a session every read is refused as a real backend refuses it, so the shell asks for sign-in.
export function refuseWithoutSession<T extends Api>(api: T): T {
  const refuse = () => Promise.reject(new ApiError(401, 'authentication_required', 'Authentication required'));
  return new Proxy(api, {get: (target, key, receiver) => (typeof Reflect.get(target, key, receiver) === 'function' ? refuse : undefined)});
}
