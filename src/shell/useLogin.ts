import {useEffect, useState} from 'react';
import {useLang, useT, type Params, type Translator} from '../i18n';
import type {Key} from '../i18n';
import {docsHref} from '../features/shared/docs';
import {ApiError, errorText} from '../api/error';
import {DEMO_ACCOUNT, discoverAuth, openSession, servesNativeApi, signInKind, type AuthCredentials, type SignIn} from '../api/auth';
import {endSession, saveSession} from '../api/session';
import {isDemoApi, normalizeApi, readProfiles, writeProfiles, type Profile} from '../api/profiles';

export function loginProfiles(profiles: Profile[], profileId: string, api: string, token: string): Profile[] | null {
  if (!profiles.some(profile => profile.id === profileId && normalizeApi(profile.api) === normalizeApi(api))) return null;
  return profiles.map(profile => (profile.id === profileId ? {...profile, token: token.trim()} : profile));
}

const USERNAME = /^[A-Za-z0-9_.-]{1,64}$/;
// The backend's own limits, checked first so a typo costs no attempt against its rate limit. The minimum length
// binds a new password only: an existing account is the backend's to judge, and the demo's password is short.
type Field = 'username' | 'password' | 'confirm';
export function credentialProblems(kind: 'setup' | 'login', username: string, password: string, confirm: string): Partial<Record<Field, Key>> {
  const problems: Partial<Record<Field, Key>> = {};
  if (!username) problems.username = 'login.usernameRequired';
  else if (!USERNAME.test(username)) problems.username = 'login.badUsername';
  const length = [...password].length;
  if (!length) problems.password = 'login.passwordRequired';
  else if (kind === 'setup' && length < 8) problems.password = 'login.passwordShort';
  else if (length > 128 || new TextEncoder().encode(password).length > 512) problems.password = 'login.passwordLong';
  else if (kind === 'setup' && password !== confirm) problems.confirm = 'login.mismatch';
  return problems;
}

type Refusal = {key: Key; params?: Params; switchTo?: SignIn};
// Branches on the error code, never the message; a conflict means the account state moved, so the form follows it.
export function signInRefusal(error: unknown): Refusal | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'invalid_credentials') return {key: 'login.invalidCredentials'};
  if (error.code === 'setup_required') return {key: 'login.needsSetup', switchTo: 'setup'};
  if (error.code === 'setup_already_completed') return {key: 'login.alreadySetUp', switchTo: 'login'};
  if (error.code === 'permission_denied') return {key: 'login.setupPeer'};
  if (error.code === 'rate_limited') return {key: 'login.rateLimited', params: {n: error.retryAfter ?? 60}};
  return null;
}

// A missing discovery endpoint may still belong to a native API without auth reporting.
export function predatesAuth(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  return error instanceof ApiError && (error.status === 404 || error.status === 401 || error.status === 403);
}

export async function resolveSignInKind(api: string, signal?: AbortSignal): Promise<SignIn | 'no-api'> {
  try {
    return signInKind(await discoverAuth(api, signal));
  } catch (error) {
    if (!predatesAuth(error)) throw error;
    if (!(error instanceof ApiError) || error.status !== 404) return 'token';
    return (await servesNativeApi(api, signal)) ? 'token' : 'no-api';
  }
}

// Writes the pasted token into the profile being signed in to. Null once it is stored, else what the form reports;
// a profile removed or repointed meanwhile is not rewritten.
export function storeToken(profileId: string, api: string, token: string): Key | null {
  try {
    const {profiles, activeId} = readProfiles();
    const updated = loginProfiles(profiles, profileId, api, token);
    if (!updated) return 'login.stale';
    writeProfiles({profiles: updated, activeId});
  } catch {
    return 'settings.saveError';
  }
  return null;
}

// Opens a session and keeps it in this tab. Null once it is kept, else a refusal the form names or the error it
// reports as a failed sign-in.
export async function signIn(
  profileId: string,
  api: string,
  mode: 'setup' | 'login',
  credentials: AuthCredentials
): Promise<Refusal | {error: unknown} | null> {
  let session;
  try {
    session = await openSession(api, mode, credentials);
  } catch (error) {
    return signInRefusal(error) ?? {error};
  }
  try {
    saveSession(profileId, api, session.token, session.expires_at);
  } catch {
    // The sign-in succeeded; only the tab's storage refused the session.
    return {key: 'settings.saveError'};
  }
  return null;
}

type Failure = {key: Key; params?: Params} | string;
type Alert = {tone: 'negative' | 'informative'; text: string; focus: boolean; id: number};
// A refusal after a submit takes focus, again on each attempt; the notes shown on arrival do not.
export function loginAlert(
  state: {kind: SignIn | 'no-api' | null; failure: Failure | null; attempt: number; ended: boolean; rejected: boolean},
  t: Translator
): Alert | null {
  const {kind, failure, attempt, ended, rejected} = state;
  if (kind === 'no-api') return null;
  if (failure !== null) return {tone: 'negative', text: typeof failure === 'string' ? failure : t(failure.key, failure.params), focus: true, id: attempt};
  if (ended) return {tone: 'informative', text: t('login.sessionEnded'), focus: false, id: 0};
  if (rejected && kind === 'token') return {tone: 'negative', text: t('login.rejected'), focus: false, id: 0};
  return null;
}

export function useLogin(profileId: string, api: string, backend: string, rejected: boolean) {
  const t = useT();
  const lang = useLang();
  // A session this tab held and the backend no longer accepts has ended; it is dropped before asking again.
  // endSession is idempotent for the page load, so running it in the initializer is safe under StrictMode.
  const [ended] = useState(() => endSession(profileId, api));
  const [kind, setKind] = useState<SignIn | 'no-api' | null>(null);
  const [discovery, setDiscovery] = useState<{attempt: number; error: Error | null}>({attempt: 0, error: null});
  useEffect(() => {
    const controller = new AbortController();
    resolveSignInKind(api, controller.signal).then(
      kind => setKind(kind),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setDiscovery(state => ({...state, error: error instanceof Error ? error : new Error(String(error))}));
      }
    );
    return () => controller.abort();
  }, [api, discovery.attempt]);
  const [token, setToken] = useState('');
  // The demo backend publishes its account, so its form arrives filled in and says so.
  const demo = isDemoApi(api);
  const [username, setUsername] = useState(demo ? DEMO_ACCOUNT.username : '');
  const [password, setPassword] = useState(demo ? DEMO_ACCOUNT.password : '');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // A field's own problem shows on that field until it is edited; a refusal of the whole form shows once above it.
  const [problems, setProblems] = useState<Partial<Record<Field, Key>>>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const edit = (field: Field, set: (value: string) => void) => (value: string) => {
    set(value);
    if (problems[field]) setProblems(({[field]: _, ...rest}) => rest);
  };
  const submitToken = () => {
    if (!token.trim()) return;
    const problem = storeToken(profileId, api, token);
    if (problem) setFailure({key: problem});
    else location.reload();
  };
  const submitPassword = async (mode: 'setup' | 'login') => {
    const found = credentialProblems(mode, username, password, confirm);
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const refused = await signIn(profileId, api, mode, {username, password});
    if (!refused) {
      location.reload();
      return;
    }
    setBusy(false);
    if ('error' in refused) {
      setFailure(t('login.failed', {error: errorText(refused.error, t)}));
      return;
    }
    if (refused.switchTo) {
      setKind(refused.switchTo);
      setConfirm('');
    }
    setFailure(refused);
  };
  const usesPassword = kind === 'setup' || kind === 'login';
  const fieldError = (field: Field) => (problems[field] ? t(problems[field]) : undefined);
  return {
    kind,
    discoveryError: discovery.error,
    retryDiscovery: () => setDiscovery(state => ({attempt: state.attempt + 1, error: null})),
    title: t(kind === 'no-api' ? 'login.noApiTitle' : kind === 'setup' ? 'login.setupTitle' : kind === 'token' ? 'login.title' : 'login.passwordTitle'),
    note:
      kind === 'no-api'
        ? t('login.noApiNote')
        : kind === 'setup'
          ? t('login.setupNote', {backend})
          : kind === 'login'
            ? t('login.connectedTo', {backend})
            : t('login.note', {backend}),
    demoNote: demo && kind === 'login' ? t('login.demoNote', DEMO_ACCOUNT) : null,
    alert: loginAlert({kind, failure, attempt, ended, rejected}, t),
    busy,
    token,
    setToken,
    username,
    setUsername: edit('username', setUsername),
    usernameError: fieldError('username'),
    password,
    setPassword: edit('password', setPassword),
    passwordError: fieldError('password'),
    confirm,
    setConfirm: edit('confirm', setConfirm),
    confirmError: fieldError('confirm'),
    submit: () => {
      if (busy || kind === 'no-api') return;
      setFailure(null);
      setAttempt(value => value + 1);
      if (usesPassword) void submitPassword(kind);
      else submitToken();
    },
    // Credentials are checked on submit and each problem shows on its field, so the button stays enabled for them.
    canSubmit: kind !== 'no-api' && (usesPassword || !!token.trim()),
    secretType: shown ? 'text' : 'password',
    toggle: () => setShown(value => !value),
    toggleText: t(usesPassword ? (shown ? 'login.hidePassword' : 'login.showPassword') : shown ? 'settings.hideToken' : 'settings.showToken'),
    guideHref: docsHref(lang),
    requirementsHref: docsHref(lang, 'no-native-api')
  };
}
