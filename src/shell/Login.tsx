import {useT} from '../i18n';
import {useLogin} from './useLogin';
import {Button, InlineAlert, Link, Loading, TextField} from '../ui/ui';

export function Login({profileId, api, backend, rejected}: {profileId: string; api: string; backend: string; rejected: boolean}) {
  const t = useT();
  const view = useLogin(profileId, api, backend, rejected);
  const reveal = (
    <Button quiet onPress={view.toggle}>
      {view.toggleText}
    </Button>
  );
  return (
    <form
      className="rp-card rp-login"
      onSubmit={event => {
        event.preventDefault();
        view.submit();
      }}
    >
      <h2 className="rp-h3">{view.title}</h2>
      {view.kind === null ? (
        <Loading />
      ) : (
        <>
          <span className="rp-label">{view.note}</span>
          {view.alert && (
            <InlineAlert key={view.alert.id} tone={view.alert.tone} takeFocus={view.alert.focus}>
              {view.alert.text}
            </InlineAlert>
          )}
          {view.kind === 'token' ? (
            <TextField
              label={t('login.token')}
              name="token"
              type={view.secretType}
              value={view.token}
              autoComplete="off"
              onChange={view.setToken}
              action={reveal}
            />
          ) : (
            <>
              <TextField
                label={t('login.username')}
                name="username"
                value={view.username}
                autoComplete="username"
                spellCheck="false"
                error={view.usernameError}
                onChange={view.setUsername}
              />
              <TextField
                label={t('login.password')}
                name="password"
                type={view.secretType}
                value={view.password}
                autoComplete={view.kind === 'setup' ? 'new-password' : 'current-password'}
                description={view.kind === 'setup' ? t('login.passwordRule') : undefined}
                error={view.passwordError}
                onChange={view.setPassword}
                action={reveal}
              />
              {view.kind === 'setup' && (
                <TextField
                  label={t('login.confirm')}
                  name="confirm"
                  type={view.secretType}
                  value={view.confirm}
                  autoComplete="new-password"
                  error={view.confirmError}
                  onChange={view.setConfirm}
                />
              )}
            </>
          )}
          <div className="rp-toolbar">
            <Button accent type="submit" isDisabled={!view.canSubmit} isPending={view.busy}>
              {t(view.kind === 'setup' ? 'login.create' : view.kind === 'login' ? 'login.signIn' : 'login.submit')}
            </Button>
            <Link appearance="link" href="#/settings">
              {t('login.settings')}
            </Link>
          </div>
        </>
      )}
    </form>
  );
}
