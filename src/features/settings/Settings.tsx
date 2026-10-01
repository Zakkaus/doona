import {Fragment, useId, type ReactNode} from 'react';
import {LANGS, useT, type Lang} from '../../i18n';
import {ActionHelp, Button, Card, ErrorMessage, LabeledSelect, Light, Link, InlineAlert, ConfirmDialog, Switch, TextField} from '../../ui/ui';
import {SearchSelect} from '../../ui/SearchSelect';
import type {PaletteId, Scheme, ToastPlacement, Wordmark} from '../../shell/preferences';
import {useSettingsPage} from './useSettingsPage';
import {useSignOut} from './useSignOut';
import {RuntimeSettingsCard} from './RuntimeSettings';
import {BackendActionsCard} from './BackendActions';
import {GeodataSettingsCard} from './GeodataSettings';
import {About} from '../../shell/About';
import {openShortcuts} from '../../shell/shortcuts';
import type {PageProps, RoutePath} from '../../shell/routes';
import {settingsCard, settingsCards, type SettingsCardId} from './nav';

const cards = {backend: settingsCard('backend'), appearance: settingsCard('appearance'), about: settingsCard('about')};

export function Settings({query}: PageProps) {
  const t = useT();
  const session = useSignOut();
  const {
    activeId,
    staleLogin,
    loginReason,
    hasActive,
    profileReason,
    firstRun,
    error,
    retry,
    api,
    changeApi,
    token,
    changeToken,
    demo,
    passwordMode,
    paired,
    invalidText,
    pending,
    saving,
    dialog,
    setDialog,
    name,
    setName,
    confirmProfile,
    save,
    switchProfile,
    confirmSwitch,
    switchPending,
    cancelSwitch,
    testConnection,
    lang,
    pickLang,
    ap,
    paletteSections,
    startPageItems,
    profile,
    tokenType,
    tokenToggleText,
    toggleToken,
    versionWarning,
    install,
    installHint,
    guide,
    addProfile,
    renameProfile,
    dialogTitle,
    dialogBlocked,
    dialogDiscards,
    deleteHelp
  } = useSettingsPage(query);
  const mirrorHelpId = useId();
  const countryFlagsHelpId = useId();

  const content: Record<SettingsCardId, ReactNode> = {
    backend: (
      <Card aria-label={t(cards.backend.titleKey)} id={cards.backend.headingId}>
        <ErrorMessage error={error} onRetry={retry} />
        {staleLogin && <InlineAlert tone="negative">{t('login.stale')}</InlineAlert>}
        {(loginReason === 'rejected' || loginReason === 'required') && (
          <InlineAlert tone="informative">{t(loginReason === 'rejected' ? 'login.rejected' : 'login.tokenRequired')}</InlineAlert>
        )}
        <ActionHelp reason={profileReason}>
          <div className="rp-toolbar">
            <LabeledSelect
              label={t('settings.profile')}
              side
              value={activeId}
              isDisabled={!hasActive || saving}
              items={profile.choices}
              onChange={switchProfile}
            />
            <Button onPress={addProfile}>{t('settings.addProfile')}</Button>
            <Button isDisabled={!hasActive} onPress={renameProfile}>
              {t('settings.renameProfile')}
            </Button>
            <Button isDisabled={!hasActive} onPress={() => setDialog('delete')}>
              {t('settings.deleteProfile')}
            </Button>
            {session && (
              <Button isPending={session.busy} onPress={() => void session.signOut()}>
                {t('settings.signOut')}
              </Button>
            )}
          </div>
        </ActionHelp>
        {session?.tokenOnly && <span className="rp-label">{t('settings.signOutTokenHelp')}</span>}
        <form
          className="rp-form"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            label={t('ui.backendUrl')}
            autoComplete="url"
            spellCheck={false}
            description={t('settings.apiHelp')}
            error={invalidText}
            name="api"
            value={api}
            onChange={changeApi}
          />
          {demo ? null : passwordMode ? (
            <p className="rp-label">{t('settings.passwordMode')}</p>
          ) : (
            <TextField
              label={t('settings.token')}
              autoComplete="off"
              spellCheck={false}
              reveal={{shown: tokenType === 'text', label: tokenToggleText, onToggle: toggleToken}}
              name="token"
              type={tokenType}
              value={token}
              onChange={changeToken}
            />
          )}
          <div className="rp-toolbar">
            <Button onPress={() => void testConnection()} isPending={pending} isDisabled={saving}>
              {t('settings.test')}
            </Button>
            <Button type="submit" accent isPending={saving} isDisabled={staleLogin}>
              {t('settings.save')}
            </Button>
          </div>
          <div className="rp-label">{t('settings.saveHelp')}</div>
          {pending && <div role="status">{t('settings.testing')}</div>}
          {profile.result && (
            <div role={profile.result.role}>
              {profile.result.text}
              {profile.result.request && <span className="rp-code">{profile.result.request}</span>}
            </div>
          )}
        </form>
      </Card>
    ),
    runtime: <RuntimeSettingsCard />,
    geodata: <GeodataSettingsCard />,
    appearance: (
      <Card level={2} title={t(cards.appearance.titleKey)} titleId={cards.appearance.headingId}>
        <div className="rp-toolbar">
          <LabeledSelect label={t('ui.lang')} value={lang} onChange={value => pickLang(value as Lang)} items={LANGS.map(([id, label]) => ({id, label}))} />
          <SearchSelect
            label={t('ui.palette')}
            searchLabel={t('shell.shortcutSearch')}
            sections={paletteSections.map(section => ({...section, id: section.title}))}
            value={ap.palette}
            onChange={value => ap.pickPalette(value as PaletteId)}
          />
          <LabeledSelect
            label={t('settings.scheme')}
            value={ap.scheme}
            onChange={value => ap.pickScheme(value as Scheme)}
            items={[
              {id: 'system', label: t('theme.system')},
              {id: 'light', label: t('theme.light')},
              {id: 'dark', label: t('theme.dark')}
            ]}
          />
          <LabeledSelect
            label={t('ui.wordmark')}
            value={ap.wordmark}
            onChange={value => ap.pickWordmark(value as Wordmark)}
            items={[
              {id: 'gradient', label: t('wordmark.gradient')},
              {id: 'plain', label: t('wordmark.plain')}
            ]}
          />
          <LabeledSelect
            label={t('settings.toastPlacement')}
            value={ap.toastPlacement}
            onChange={value => ap.pickToastPlacement(value as ToastPlacement)}
            items={[
              {id: 'top', label: t('settings.toastTop')},
              {id: 'top end', label: t('settings.toastTopEnd')},
              {id: 'bottom', label: t('settings.toastBottom')},
              {id: 'bottom end', label: t('settings.toastBottomEnd')}
            ]}
          />
          <LabeledSelect label={t('settings.startPage')} value={ap.startPage} onChange={value => ap.pickStartPage(value as RoutePath)} items={startPageItems} />
        </div>
        <div className="rp-field">
          <Switch isSelected={ap.countryFlags} onChange={ap.pickCountryFlags} aria-describedby={countryFlagsHelpId}>
            {t('settings.countryFlags')}
          </Switch>
          <span id={countryFlagsHelpId} className="rp-label">
            {t('settings.countryFlagsHelp')}
          </span>
        </div>
        <div className="rp-field">
          <Switch isSelected={ap.mirrored} onChange={ap.pickMirrored} aria-describedby={mirrorHelpId}>
            {t('settings.mirror')}
          </Switch>
          <span id={mirrorHelpId} className="rp-label">
            {t('settings.mirrorHelp')}
          </span>
        </div>
      </Card>
    ),
    actions: <BackendActionsCard />,
    about: (
      <Card level={2} title={t(cards.about.titleKey)} titleId={cards.about.headingId}>
        {versionWarning && (
          <Light small tone="warn">
            {versionWarning}
          </Light>
        )}
        <div className="rp-cluster">
          <About trigger={<Button>{t('about.title')}</Button>} />
          <Button onPress={openShortcuts}>{t('shell.shortcuts')}</Button>
          <Link appearance="button" href={guide} external>
            {t('shell.guide')}
          </Link>
          {install && <Button onPress={install}>{t('settings.install')}</Button>}
          {installHint && <p className="rp-note">{installHint}</p>}
        </div>
      </Card>
    )
  };

  return (
    <div className="rp-page">
      {firstRun && <p className="rp-note">{t('settings.firstRun')}</p>}
      {paired && <p className="rp-note">{t('settings.paired')}</p>}
      {settingsCards.map(card => (
        <Fragment key={card.id}>{content[card.id]}</Fragment>
      ))}
      <ConfirmDialog
        title={t('config.discardTitle')}
        isOpen={switchPending}
        onCancel={cancelSwitch}
        confirmLabel={t('config.discard')}
        isPending={saving}
        onConfirm={confirmSwitch}
      >
        <p className="rp-label">{t('settings.switchProfileHelp')}</p>
      </ConfirmDialog>
      {dialog && (
        <ConfirmDialog
          title={dialogTitle}
          isOpen
          onCancel={() => setDialog(null)}
          tone={dialog === 'delete' ? 'negative' : 'accent'}
          confirmLabel={t(dialog === 'delete' ? 'settings.deleteProfile' : 'settings.save')}
          isDisabled={dialogBlocked}
          isPending={saving}
          error={profile.result?.error ? {id: profile.result.id, text: profile.result.text} : null}
          onConfirm={confirmProfile}
        >
          {dialog === 'delete' ? <p className="rp-label">{deleteHelp}</p> : <TextField label={t('settings.profileName')} value={name} onChange={setName} />}
          {dialogDiscards && <p className="rp-label">{t('settings.profileDiscardHelp')}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
