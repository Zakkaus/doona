import {lazy, Suspense} from 'react';
import {useT, type Lang} from '../i18n';
import {useLogin} from './useLogin';
import {Button, ErrorMessage, Form, InlineAlert, Link, Loading, TextField} from '../ui/ui';
import {sidebarQuery, useMediaQuery} from '../ui/hooks';
import {LoadBoundary} from '../ui/LoadBoundary';
import LinkOut from '../ui/icons/LinkOut';
import logo from '../logo.svg';
import {href} from './route';
import {LanguageMenu, PaletteMenu, SchemeToggle, type PaletteMenuProps} from './AppearanceControls';

// The panel beside the form loads only where it is shown, so the sign-in chunk stays the same size on a phone. Until it
// arrives, or if it never does, the panel stays empty and the form works as before.
const LoginShowcase = lazy(() => import('./LoginShowcase'));
const emptyShowcase = <div className="rp-login-showcase" aria-hidden="true" />;

type LoginProps = {
  profileId: string;
  api: string;
  backend: string;
  rejected: boolean;
  missingApi: boolean;
  lang: Lang;
  pickLang: (lang: Lang) => void;
  dark: boolean;
  themeLabel: string;
  toggleScheme: () => void;
  palette: PaletteMenuProps;
  wordmark: string;
  // A failure the shell met besides the refusal, such as an unreachable version endpoint.
  error: Error | null;
  onRetry: () => void;
};

// The whole page until the backend accepts the credentials: nothing behind it works before then.
export function Login({
  profileId,
  api,
  backend,
  rejected,
  missingApi,
  lang,
  pickLang,
  dark,
  themeLabel,
  toggleScheme,
  palette,
  wordmark,
  error,
  onRetry
}: LoginProps) {
  const t = useT();
  const view = useLogin(profileId, api, backend, rejected, missingApi);
  const wide = useMediaQuery(sidebarQuery);
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
          <PaletteMenu {...palette} />
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
              <Form
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
                    {view.submitText}
                  </Button>
                )}
              </Form>
              {view.demoNote && <p className="rp-login-note rp-login-account">{view.demoNote}</p>}
              {links}
            </>
          )}
        </main>
      </div>
      {wide && (
        <LoadBoundary fallback={emptyShowcase}>
          <Suspense fallback={emptyShowcase}>
            <LoginShowcase />
          </Suspense>
        </LoadBoundary>
      )}
    </div>
  );
}
