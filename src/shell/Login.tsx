import {lazy, Suspense} from 'react';
import {useT, type Lang} from '../i18n';
import {useLogin} from './useLogin';
import {Button, ErrorMessage, InlineAlert, Link, Loading, TextField} from '../ui/ui';
import {useMediaQuery} from '../ui/hooks';
import LinkOut from '../ui/icons/LinkOut';
import logo from '../logo.svg';
import {href} from './route';
import {LanguageMenu, SchemeToggle} from './AppearanceControls';

// The panel beside the form loads only where it is shown, so the sign-in chunk stays the same size on a phone.
const LoginShowcase = lazy(() => import('./LoginShowcase'));

type LoginProps = {
  profileId: string;
  api: string;
  backend: string;
  rejected: boolean;
  lang: Lang;
  pickLang: (lang: Lang) => void;
  dark: boolean;
  themeLabel: string;
  toggleScheme: () => void;
  wordmark: string;
  // A failure the shell met besides the refusal, such as an unreachable version endpoint.
  error: Error | null;
  onRetry: () => void;
};

// The whole page until the backend accepts the credentials: nothing behind it works before then.
export function Login({profileId, api, backend, rejected, lang, pickLang, dark, themeLabel, toggleScheme, wordmark, error, onRetry}: LoginProps) {
  const t = useT();
  const view = useLogin(profileId, api, backend, rejected);
  const wide = useMediaQuery('(min-width: 1024px)');
  const reveal = {shown: view.secretType === 'text', label: view.toggleText, onToggle: view.toggle};
  const links = (
    <div className="rp-login-links">
      <Link appearance="link" href={href('settings')}>
        {t('login.settings')}
      </Link>
      <Link appearance="link" href={view.guideHref} external>
        {t('shell.guide')}
        <LinkOut />
      </Link>
    </div>
  );
  return (
    <div className="rp-login-page">
      <div className="rp-login-pane">
        <header className="rp-login-controls">
          <LanguageMenu lang={lang} pickLang={pickLang} />
          <SchemeToggle dark={dark} label={themeLabel} toggle={toggleScheme} />
        </header>
        <main className="rp-login-column">
          <div className="rp-login-brand">
            <img src={logo} alt="" />
            <span className="rp-brand-text">
              <span>{wordmark}</span>
            </span>
          </div>
          <div className="rp-login-head">
            <h1 className="rp-h1">{view.title}</h1>
            {view.note && <p className="rp-login-note">{view.note}</p>}
          </div>
          <ErrorMessage error={error} onRetry={onRetry} />
          {view.kind === null ? (
            view.discoveryError ? (
              <>
                <ErrorMessage error={view.discoveryError} onRetry={view.retryDiscovery} />
                {links}
              </>
            ) : (
              <Loading />
            )
          ) : (
            <>
              <form
                className="rp-login"
                onSubmit={event => {
                  event.preventDefault();
                  view.submit();
                }}
              >
                {view.alert && (
                  <InlineAlert key={view.alert.id} tone={view.alert.tone} takeFocus={view.alert.focus}>
                    {view.alert.text}
                  </InlineAlert>
                )}
                {view.kind === 'no-api' ? (
                  <Link appearance="link" href={view.requirementsHref} external>
                    {t('login.requirements')}
                    <LinkOut />
                  </Link>
                ) : view.kind === 'token' ? (
                  <TextField
                    label={t('login.token')}
                    name="token"
                    type={view.secretType}
                    value={view.token}
                    autoComplete="off"
                    onChange={view.setToken}
                    reveal={reveal}
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
                      reveal={reveal}
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
                {view.kind !== 'no-api' && (
                  <Button accent className="rp-login-submit" type="submit" isDisabled={!view.canSubmit} isPending={view.busy}>
                    {t(view.kind === 'setup' ? 'login.create' : view.kind === 'login' ? 'login.signIn' : 'login.submit')}
                  </Button>
                )}
              </form>
              {view.demoNote && <p className="rp-login-note rp-login-account">{view.demoNote}</p>}
              {links}
            </>
          )}
        </main>
      </div>
      {wide && (
        <Suspense fallback={<div className="rp-login-showcase" aria-hidden="true" />}>
          <LoginShowcase />
        </Suspense>
      )}
    </div>
  );
}
