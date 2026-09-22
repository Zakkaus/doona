import {useEffect, useState} from 'react';
import {useT, type Params} from '../i18n';
import type {Key} from '../i18n/messages';
import {ApiError} from '../api/error';
import {discoverAuth, openSession, signInKind, type SignIn} from '../api/auth';
import {endSession, saveSession} from '../api/session';
import {normalizeApi, readProfiles, writeProfiles, type Profile} from '../api/profiles';
import {errorText} from '../ui/ui';

export function loginProfiles(profiles: Profile[], profileId: string, api: string, token: string): Profile[] | null {
  if (!profiles.some(profile => profile.id === profileId && normalizeApi(profile.api) === normalizeApi(api))) return null;
  return profiles.map(profile => (profile.id === profileId ? {...profile, token: token.trim()} : profile));
}

const USERNAME = /^[A-Za-z0-9_.-]{1,64}$/;
// The backend's own limits, checked first so a typo costs no attempt against its rate limit.
export function credentialProblem(kind: 'setup' | 'login', username: string, password: string, confirm: string): Key | null {
  if (!USERNAME.test(username)) return 'login.badUsername';
  const length = [...password].length;
  if (length < 12 || length > 128 || new TextEncoder().encode(password).length > 512) return 'login.badPassword';
  if (kind === 'setup' && password !== confirm) return 'login.mismatch';
  return null;
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
  const [failure, setFailure] = useState<{key: Key; params?: Params} | string | null>(null);
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
    const problem = credentialProblem(mode, username, password, confirm);
    if (problem) {
      setFailure({key: problem});
      return;
    }
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
      setFailure(refusal ?? t('login.failed', {error: errorText(error)}));
    }
  };
  const usesPassword = kind === 'setup' || kind === 'login';
  const error =
    typeof failure === 'string'
      ? failure
      : failure
        ? t(failure.key, failure.params)
        : ended
          ? t('login.sessionEnded')
          : rejected && kind === 'token'
            ? t('login.rejected')
            : null;
  return {
    kind,
    title: t(kind === 'setup' ? 'login.setupTitle' : kind === 'login' ? 'login.passwordTitle' : 'login.title'),
    note: kind === 'setup' ? t('login.setupNote', {backend}) : kind === 'login' ? t('login.passwordNote', {backend}) : t('login.note', {backend}),
    error,
    busy,
    token,
    setToken,
    username,
    setUsername,
    password,
    setPassword,
    confirm,
    setConfirm,
    submit: () => {
      if (busy) return;
      setFailure(null);
      if (usesPassword) void submitPassword(kind);
      else submitToken();
    },
    canSubmit: usesPassword ? !!username && !!password && (kind === 'login' || !!confirm) : !!token.trim(),
    secretType: shown ? 'text' : 'password',
    toggle: () => setShown(value => !value),
    toggleText: t(usesPassword ? (shown ? 'login.hidePassword' : 'login.showPassword') : shown ? 'settings.hideToken' : 'settings.showToken')
  };
}
