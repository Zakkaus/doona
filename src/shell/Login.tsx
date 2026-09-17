import {useState} from 'react';
import {Link} from 'react-aria-components';
import {useT} from '../i18n';
import {readProfiles, writeProfiles} from '../api/profiles';
import {Button, TextField} from '../ui/ui';

// What a backend that wants a token gets instead of a wall of errors: one field, one button. The token goes
// into the active profile and the page restarts against the backend, the same way settings saves it. A token
// the backend has already turned away is said so, instead of showing the same empty form again.
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
        <Link className="rp-link" href="#/settings">
          {t('login.settings')}
        </Link>
      </div>
    </form>
  );
}
