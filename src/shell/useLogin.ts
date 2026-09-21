import {useState} from 'react';
import {useT} from '../i18n';
import {readProfiles, writeProfiles} from '../api/profiles';

export function useLogin(backend: string, rejected: boolean) {
  const t = useT();
  const [token, setToken] = useState('');
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = () => {
    if (!token.trim()) return;
    try {
      const {profiles, activeId} = readProfiles();
      if (!profiles.some(profile => profile.id === activeId)) throw new Error('Missing active profile');
      writeProfiles({profiles: profiles.map(item => (item.id === activeId ? {...item, token: token.trim()} : item)), activeId});
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
