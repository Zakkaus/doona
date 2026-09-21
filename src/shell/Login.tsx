import {useState} from 'react';
import {useT} from '../i18n';
import {readProfiles, writeProfiles} from '../api/profiles';
import {Button, Link, TextField} from '../ui/ui';

// Save the token into the active profile and restart against the backend; show rejection when that token already failed.
export function Login({backend, rejected}: {backend: string; rejected: boolean}) {
  const t = useT();
  const [token, setToken] = useState('');
  const [shown, setShown] = useState(false);
  const submit = () => {
    const {profiles, activeId} = readProfiles();
    writeProfiles({profiles: profiles.map(item => (item.id === activeId ? {...item, token: token.trim()} : item)), activeId});
    location.reload();
  };
  return (
    <form
      className="rp-card rp-login"
      onSubmit={event => {
        event.preventDefault();
        if (token.trim()) submit();
      }}
    >
      <h2 className="rp-h3">{t('login.title')}</h2>
      <span className="rp-label">{t('login.note', {backend})}</span>
      {rejected && <p role="alert">{t('login.rejected')}</p>}
      <TextField
        label={t('login.token')}
        name="token"
        type={shown ? 'text' : 'password'}
        value={token}
        autoComplete="off"
        onChange={setToken}
        action={
          <Button quiet onPress={() => setShown(value => !value)}>
            {t(shown ? 'settings.hideToken' : 'settings.showToken')}
          </Button>
        }
      />
      <div className="rp-toolbar">
        <Button accent type="submit" isDisabled={!token.trim()}>
          {t('login.submit')}
        </Button>
        <Link appearance="link" href="#/settings">
          {t('login.settings')}
        </Link>
      </div>
    </form>
  );
}
