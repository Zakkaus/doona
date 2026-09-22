import {useState} from 'react';
import {useT} from '../i18n';
import {normalizeApi, readProfiles, writeProfiles, type Profile} from '../api/profiles';

export function loginProfiles(profiles: Profile[], profileId: string, api: string, token: string): Profile[] | null {
  if (!profiles.some(profile => profile.id === profileId && normalizeApi(profile.api) === normalizeApi(api))) return null;
  return profiles.map(profile => (profile.id === profileId ? {...profile, token: token.trim()} : profile));
}

export function useLogin(profileId: string, api: string, backend: string, rejected: boolean) {
  const t = useT();
  const [token, setToken] = useState('');
  const [shown, setShown] = useState(false);
  const [failure, setFailure] = useState<'stale' | 'storage' | null>(null);
  const submit = () => {
    if (!token.trim()) return;
    try {
      const {profiles, activeId} = readProfiles();
      const updated = loginProfiles(profiles, profileId, api, token);
      if (!updated) {
        setFailure('stale');
        return;
      }
      writeProfiles({profiles: updated, activeId});
    } catch {
      setFailure('storage');
      return;
    }
    location.reload();
  };
  return {
    token,
    setToken,
    submit,
    canSubmit: !!token.trim(),
    tokenType: shown ? 'text' : 'password',
    toggle: () => setShown(value => !value),
    toggleText: t(shown ? 'settings.hideToken' : 'settings.showToken'),
    note: t('login.note', {backend}),
    error: failure ? t(failure === 'stale' ? 'login.stale' : 'settings.saveError') : rejected ? t('login.rejected') : null
  };
}
