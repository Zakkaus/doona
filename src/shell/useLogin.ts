import {useState} from 'react';
import {useT} from '../i18n';
import {readProfiles, writeProfiles} from '../api/profiles';

// The token goes to the profile that raised the challenge, not to whichever profile is active by the time
// the form is submitted.
export function useLogin(profileId: string, backend: string, rejected: boolean) {
  const t = useT();
  const [token, setToken] = useState('');
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = () => {
    if (!token.trim()) return;
    try {
      const {profiles, activeId} = readProfiles();
      if (!profiles.some(profile => profile.id === profileId)) throw new Error('Missing profile');
      writeProfiles({profiles: profiles.map(item => (item.id === profileId ? {...item, token: token.trim()} : item)), activeId});
    } catch {
      setFailed(true);
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
    error: failed ? t('settings.saveError') : rejected ? t('login.rejected') : null
  };
}
