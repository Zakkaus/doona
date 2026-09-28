import type {Api} from '../api';
import {DEMO_ACCOUNT, type AuthCredentials, type AuthDiscovery, type AuthSession} from '../auth';
import {ApiError} from '../error';
import {uuid} from '../hash';

const PREFIX = 'demo-session-';
const LIFETIME = 12 * 3600_000;

// The demo answers discovery the way a password backend does once its administrator exists.
export function mockDiscovery(): AuthDiscovery {
  return {mode: 'password', setup_required: false};
}
const authLinks = {auth_setup: '/api/v1/auth/setup', auth_login: '/api/v1/auth/login'} as const;

export function mockOpenSession(kind: 'setup' | 'login', credentials: AuthCredentials): AuthSession {
  if (kind === 'setup') throw new ApiError(409, 'setup_already_completed', 'Setup already completed');
  if (credentials.username !== DEMO_ACCOUNT.username || credentials.password !== DEMO_ACCOUNT.password)
    throw new ApiError(401, 'invalid_credentials', 'Invalid credentials');
  return {token: PREFIX + uuid(), expires_at: new Date(Date.now() + LIFETIME).toISOString()};
}

// The mock keeps no server state across reloads, so any session it issued is accepted by its form.
export function mockSessionValid(token: string | null | undefined): boolean {
  return !!token?.startsWith(PREFIX);
}

// A signed-in demo reads the admitted discovery with the same password auth that sign-in reads.
export function withPasswordAuth<T extends Api>(api: T): T {
  return {
    ...api,
    discovery: async signal => {
      const discovery = await api.discovery(signal);
      if (!('status' in discovery)) return discovery;
      return {
        ...discovery,
        links: {...discovery.links, ...authLinks, auth_logout: '/api/v1/auth/logout'},
        auth: {...mockDiscovery(), anonymous_loopback: false}
      };
    }
  };
}

// Without a session only the public discovery answers; every other read is refused as a real backend refuses it,
// so the shell asks for sign-in.
export function refuseWithoutSession<T extends Api>(api: T): T {
  const refuse = () => Promise.reject(new ApiError(401, 'authentication_required', 'Authentication required'));
  const discovery: Api['discovery'] = async signal => {
    signal?.throwIfAborted();
    return {name: 'dae/honk-native', api_major: 1, links: {...authLinks}, auth: mockDiscovery()};
  };
  return new Proxy(api, {
    get: (target, key, receiver) => (key === 'discovery' ? discovery : typeof Reflect.get(target, key, receiver) === 'function' ? refuse : undefined)
  });
}
