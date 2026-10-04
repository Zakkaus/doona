import {useT, type Lang} from '../i18n';
import {useLogin} from './useLogin';
import {Button, Card, ErrorMessage, Form, InlineAlert, Link, Loading, TextField} from '../ui/ui';
import LinkOut from '../ui/icons/LinkOut';
import logo from '../logo.svg';
import {href} from './route';
import {LanguageMenu, PaletteMenu, SchemeToggle, type PaletteMenuProps} from './AppearanceControls';

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

// The whole page until the backend accepts the credentials: nothing behind it works before then. One card centred on
// the page background, the same on a phone and a desktop, with the appearance controls in the corner.
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
      <header className="rp-login-controls">
        <LanguageMenu lang={lang} pickLang={pickLang} />
        <PaletteMenu {...palette} />
        <SchemeToggle dark={dark} label={themeLabel} toggle={toggleScheme} />
      </header>
      <main className="rp-login-main">
        <Card className="rp-login-card">
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
        </Card>
      </main>
    </div>
  );
}
