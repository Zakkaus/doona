import {useT} from '../i18n';
import {useLogin} from './useLogin';
import {Button, Link, TextField} from '../ui/ui';

export function Login({backend, rejected}: {backend: string; rejected: boolean}) {
  const t = useT();
  const view = useLogin(backend, rejected);
  return (
    <form
      className="rp-card rp-login"
      onSubmit={event => {
        event.preventDefault();
        view.submit();
      }}
    >
      <h2 className="rp-h3">{t('login.title')}</h2>
      <span className="rp-label">{view.note}</span>
      {view.error && <p role="alert">{view.error}</p>}
      <TextField
        label={t('login.token')}
        name="token"
        type={view.tokenType}
        value={view.token}
        autoComplete="off"
        onChange={view.setToken}
        action={
          <Button quiet onPress={view.toggle}>
            {view.toggleText}
          </Button>
        }
      />
      <div className="rp-toolbar">
        <Button accent type="submit" isDisabled={!view.canSubmit}>
          {t('login.submit')}
        </Button>
        <Link appearance="link" href="#/settings">
          {t('login.settings')}
        </Link>
      </div>
    </form>
  );
}
