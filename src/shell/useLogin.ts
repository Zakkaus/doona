import {useEffect, useState} from 'react';
import {useT, type Params} from '../i18n';
import type {Key} from '../i18n';
import {ApiError, errorText} from '../api/error';
import {discoverAuth, openSession, signInKind, type SignIn} from '../api/auth';
import {endSession, saveSession} from '../api/session';
import {normalizeApi, readProfiles, writeProfiles, type Profile} from '../api/profiles';

export function loginProfiles(profiles: Profile[], profileId: string, api: string, token: string): Profile[] | null {
  if (!profiles.some(profile => profile.id === profileId && normalizeApi(profile.api) === normalizeApi(api))) return null;
  return profiles.map(profile => (profile.id === profileId ? {...profile, token: token.trim()} : profile));
}

const USERNAME = /^[A-Za-z0-9_.-]{1,64}$/;
// The backend's own limits, checked first so a typo costs no attempt against its rate limit.
type Field = 'username' | 'password' | 'confirm';
export function credentialProblems(kind: 'setup' | 'login', username: string, password: string, confirm: string): Partial<Record<Field, Key>> {
  const problems: Partial<Record<Field, Key>> = {};
  if (!USERNAME.test(username)) problems.username = 'login.badUsername';
  const length = [...password].length;
  if (length < 8 || length > 128 || new TextEncoder().encode(password).length > 512) problems.password = 'login.badPassword';
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

export function useLogin(profileId: string, api: string, backend: string, rejected: boolean) {
  const t = useT();
  // A session this tab held and the backend no longer accepts has ended; it is dropped before asking again.
  // endSession is idempotent for the page load, so running it in the initializer is safe under StrictMode.
  const [ended] = useState(() => endSession(profileId, api));
  const [kind, setKind] = useState<SignIn | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    discoverAuth(api, controller.signal).then(
      auth => setKind(signInKind(auth)),
      () => {
        // Without discovery the backend is treated as one that predates password login.
        if (!controller.signal.aborted) setKind('token');
      }
    );
    return () => controller.abort();
  }, [api]);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // A field's own problem shows on that field until it is edited; a refusal of the whole form shows once above it.
  const [problems, setProblems] = useState<Partial<Record<Field, Key>>>({});
  const [failure, setFailure] = useState<{key: Key; params?: Params} | string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const edit = (field: Field, set: (value: string) => void) => (value: string) => {
    set(value);
    if (problems[field]) setProblems(({[field]: _, ...rest}) => rest);
  };
  const submitToken = () => {
    if (!token.trim()) return;
    try {
      const {profiles, activeId} = readProfiles();
      const updated = loginProfiles(profiles, profileId, api, token);
      if (!updated) {
        setFailure({key: 'login.stale'});
        return;
      }
      writeProfiles({profiles: updated, activeId});
    } catch {
      setFailure({key: 'settings.saveError'});
      return;
    }
    location.reload();
  };
  const submitPassword = async (mode: 'setup' | 'login') => {
    const found = credentialProblems(mode, username, password, confirm);
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const session = await openSession(api, mode, {username, password});
      saveSession(profileId, api, session.token, session.expires_at);
      location.reload();
    } catch (error) {
      setBusy(false);
      const refusal = signInRefusal(error);
      if (refusal?.switchTo) {
        setKind(refusal.switchTo);
        setConfirm('');
      }
      setFailure(refusal ?? t('login.failed', {error: errorText(error, t)}));
    }
  };
  const usesPassword = kind === 'setup' || kind === 'login';
  // A refusal after a submit takes focus; the notes shown on arrival do not.
  const alert =
    failure !== null
      ? {tone: 'negative' as const, text: typeof failure === 'string' ? failure : t(failure.key, failure.params), focus: true, id: attempt}
      : ended
        ? {tone: 'informative' as const, text: t('login.sessionEnded'), focus: false, id: 0}
        : rejected && kind === 'token'
          ? {tone: 'negative' as const, text: t('login.rejected'), focus: false, id: 0}
          : null;
  const fieldError = (field: Field) => (problems[field] ? t(problems[field]) : undefined);
  return {
    kind,
    title: t(kind === 'setup' ? 'login.setupTitle' : kind === 'login' ? 'login.passwordTitle' : 'login.title'),
    note: kind === 'setup' ? t('login.setupNote', {backend}) : kind === 'login' ? t('login.passwordNote', {backend}) : t('login.note', {backend}),
    alert,
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
      if (busy) return;
      setFailure(null);
      setAttempt(value => value + 1);
      if (usesPassword) void submitPassword(kind);
      else submitToken();
    },
    // Credentials are checked on submit and each problem shows on its field, so the button stays enabled for them.
    canSubmit: usesPassword || !!token.trim(),
    secretType: shown ? 'text' : 'password',
    toggle: () => setShown(value => !value),
    toggleText: t(usesPassword ? (shown ? 'login.hidePassword' : 'login.showPassword') : shown ? 'settings.hideToken' : 'settings.showToken')
  };
}
