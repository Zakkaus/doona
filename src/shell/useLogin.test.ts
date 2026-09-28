import {afterEach, expect, it, vi} from 'vitest';
import {credentialProblems, loginAlert, loginProfiles, predatesAuth, resolveSignInKind, secondsLeft, signIn, signInRefusal, storeToken} from './useLogin';
import {ApiError} from '../api/error';
import {signInKind} from '../api/auth';
import {translate, type Translator} from '../i18n';

const challenged = {id: 'router', name: 'Router', api: 'https://router.test/api-prefix', token: ''};

afterEach(() => vi.unstubAllGlobals());

it('distinguishes a missing native API from discovery without auth reporting', async () => {
  const fetcher = vi.fn(
    async (_input: URL) =>
      new Response(JSON.stringify({error: {code: 'not_found', message: 'Not found'}}), {status: 404, headers: {'Content-Type': 'application/json'}})
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await resolveSignInKind('https://router.test')).toBe('no-api');
  expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual(['https://router.test/api', 'https://router.test/api/v1/capabilities']);

  fetcher.mockImplementation(async (input: URL) => (String(input).endsWith('/api') ? new Response('{}', {status: 404}) : new Response('{}', {status: 401})));
  expect(await resolveSignInKind('https://router.test')).toBe('token');
});

it('signs in from the public discovery view a backend gives a caller it does not admit yet', async () => {
  const view = (setup_required: boolean) => ({
    name: 'dae/honk-native',
    api_major: 1,
    links: {auth_setup: '/api/v1/auth/setup', auth_login: '/api/v1/auth/login'},
    auth: {mode: 'password', setup_required}
  });
  const fetcher = vi.fn(async (_input: URL) => new Response(JSON.stringify(view(true)), {headers: {'Content-Type': 'application/json'}}));
  vi.stubGlobal('fetch', fetcher);
  expect(await resolveSignInKind('https://router.test')).toBe('setup');
  fetcher.mockImplementation(async () => new Response(JSON.stringify(view(false)), {headers: {'Content-Type': 'application/json'}}));
  expect(await resolveSignInKind('https://router.test')).toBe('login');
  expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual(['https://router.test/api', 'https://router.test/api']);
});

it('rejects a removed or repointed profile without changing its credentials', () => {
  const repointed = {...challenged, api: 'https://other.test', token: 'other-secret'};
  expect(loginProfiles([repointed], challenged.id, challenged.api, 'secret')).toBeNull();
  expect(repointed.token).toBe('other-secret');
  expect(loginProfiles([{...challenged, id: 'replacement'}], challenged.id, challenged.api, 'secret')).toBeNull();
});

it('updates only the challenged endpoint, preserving concurrent profile changes', () => {
  const renamed = {...challenged, name: 'Renamed'};
  const other = {...challenged, id: 'other', token: 'other-secret'};
  expect(loginProfiles([renamed, other], challenged.id, challenged.api + '/', ' secret ')).toEqual([{...renamed, token: 'secret'}, other]);
  expect(renamed.token).toBe('');
});

it('checks credentials against the backend limits before any attempt, per field', () => {
  expect(credentialProblems('login', 'admin', 'correct horse battery', '')).toEqual({});
  expect(credentialProblems('setup', 'ad min', 'short', 'short')).toEqual({username: 'login.badUsername', password: 'login.passwordShort'});
  // Eight scalar values, not eight UTF-16 units: an emoji counts once.
  expect(credentialProblems('setup', 'admin', '😀'.repeat(8), '😀'.repeat(8))).toEqual({});
  expect(credentialProblems('setup', 'admin', '😀'.repeat(7), '😀'.repeat(7))).toEqual({password: 'login.passwordShort'});
  // The minimum binds a new password only; an existing account, such as the demo's, is the backend's to judge.
  expect(credentialProblems('login', 'demo', 'demo', '')).toEqual({});
  expect(credentialProblems('login', 'admin', 'x'.repeat(129), '')).toEqual({password: 'login.passwordLong'});
  expect(credentialProblems('setup', 'admin', 'correct horse battery', 'correct horse batterx')).toEqual({confirm: 'login.mismatch'});
});

it('asks for an empty username or password instead of stating the format rule', () => {
  expect(credentialProblems('login', '', '', '')).toEqual({username: 'login.usernameRequired', password: 'login.passwordRequired'});
});

it('maps refusals by code and follows a moved account state', () => {
  expect(signInRefusal(new ApiError(401, 'invalid_credentials', 'x'))).toEqual({key: 'login.invalidCredentials'});
  expect(signInRefusal(new ApiError(409, 'setup_required', 'x'))?.switchTo).toBe('setup');
  expect(signInRefusal(new ApiError(409, 'setup_already_completed', 'x'))?.switchTo).toBe('login');
  expect(signInRefusal(new ApiError(429, 'rate_limited', 'x', null, null, 7))).toEqual({key: 'login.rateLimited', params: {n: 7}, wait: 7});
  expect(signInRefusal(new ApiError(429, 'rate_limited', 'x'))?.wait).toBe(60);
  expect(signInRefusal(new ApiError(500, 'internal', 'x'))).toBeNull();
  expect(signInKind(null)).toBe('token');
  expect(signInKind({mode: 'password', setup_required: true})).toBe('setup');
  expect(signInKind({mode: 'password', setup_required: false})).toBe('login');
});

it('takes only a missing or protected discovery for a backend that predates password login', () => {
  expect(predatesAuth(new ApiError(404, 'not_found', 'Not found'))).toBe(true);
  expect(predatesAuth(new ApiError(401, 'authentication_required', 'Token required'))).toBe(true);
  expect(predatesAuth(new SyntaxError('Unexpected token <'))).toBe(true);
  // A backend that cannot be reached or fails says nothing about its sign-in; the page asks to retry instead.
  expect(predatesAuth(new ApiError(0, 'network_error', 'Failed to fetch'))).toBe(false);
  expect(predatesAuth(new ApiError(502, '', 'Bad Gateway'))).toBe(false);
  expect(predatesAuth(new TypeError('Failed to fetch'))).toBe(false);
});

const t: Translator = (key, params) => translate('en', key, params);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
// A Storage stand-in; `refuse` makes every write throw, as a browser with storage blocked or full does.
function storage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  const port = {
    refuse: false,
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (port.refuse) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key)
  };
  return port;
}

it('stores a pasted token in its profile, and names a stale profile or blocked storage', () => {
  const local = storage({'doona-profiles': JSON.stringify([challenged]), 'doona-profile': challenged.id});
  vi.stubGlobal('localStorage', local);
  expect(storeToken(challenged.id, challenged.api, ' secret ')).toBeNull();
  expect(JSON.parse(local.store.get('doona-profiles')!)).toEqual([{...challenged, token: 'secret'}]);
  expect(storeToken(challenged.id, 'https://other.test', 'secret')).toBe('login.stale');
  local.refuse = true;
  expect(storeToken(challenged.id, challenged.api, 'another')).toBe('settings.saveError');
});

it('reports a rejected sign-in, then keeps the session a retry opens', async () => {
  const session = storage();
  vi.stubGlobal('sessionStorage', session);
  const fetcher = vi.fn(async (_input: URL) => json({error: {code: 'invalid_credentials', message: 'Invalid credentials'}}, 401));
  vi.stubGlobal('fetch', fetcher);
  const credentials = {username: 'admin', password: 'wrong'};
  expect(await signIn(challenged.id, challenged.api, 'login', credentials)).toEqual({key: 'login.invalidCredentials'});
  expect(session.store.size).toBe(0);

  fetcher.mockImplementation(async () => json({token: 'hnk1_x', expires_at: '2099-01-01T00:00:00Z'}));
  expect(await signIn(challenged.id, challenged.api, 'login', {...credentials, password: 'right'})).toBeNull();
  expect(JSON.parse(session.store.get('doona-session')!)).toMatchObject({profileId: challenged.id, token: 'hnk1_x'});
  expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
    'https://router.test/api-prefix/api/v1/auth/login',
    'https://router.test/api-prefix/api/v1/auth/login'
  ]);
});

it('names a session the tab cannot store apart from a failed sign-in', async () => {
  const session = storage();
  session.refuse = true;
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({token: 'hnk1_x', expires_at: '2099-01-01T00:00:00Z'}))
  );
  expect(await signIn(challenged.id, challenged.api, 'login', {username: 'admin', password: 'right'})).toEqual({key: 'settings.saveError'});
  const down = new ApiError(502, '', 'Bad Gateway');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw down;
    })
  );
  expect(await signIn(challenged.id, challenged.api, 'login', {username: 'admin', password: 'right'})).toEqual({error: down});
});

it('focuses a refusal anew on each attempt and shows the arrival notes only without one', () => {
  const refused = {kind: 'login' as const, failure: {key: 'login.invalidCredentials' as const}, ended: false, rejected: false};
  const first = loginAlert({...refused, attempt: 1}, t);
  expect(first).toEqual({tone: 'negative', text: t('login.invalidCredentials'), focus: true, id: 1});
  expect(loginAlert({...refused, attempt: 2}, t)?.id).toBe(2);
  expect(loginAlert({...refused, failure: 'Sign-in failed', attempt: 3}, t)?.text).toBe('Sign-in failed');

  const arrival = {failure: null, attempt: 0};
  expect(loginAlert({...arrival, kind: 'login', ended: true, rejected: true}, t)).toEqual({
    tone: 'informative',
    text: t('login.sessionEnded'),
    focus: false,
    id: 0
  });
  expect(loginAlert({...arrival, kind: 'token', ended: false, rejected: true}, t)).toMatchObject({text: t('login.rejected'), focus: false});
  expect(loginAlert({...arrival, kind: 'login', ended: false, rejected: true}, t)).toBeNull();
  expect(loginAlert({...refused, kind: 'no-api', attempt: 1}, t)).toBeNull();
});

it('counts the rate-limit wait down in whole seconds, rounded up, and stops at zero', () => {
  expect(secondsLeft(10_000, 7_000)).toBe(3);
  expect(secondsLeft(10_000, 7_001)).toBe(3);
  expect(secondsLeft(10_000, 9_999)).toBe(1);
  expect(secondsLeft(10_000, 10_000)).toBe(0);
  expect(secondsLeft(0, 5_000)).toBe(0);
});
