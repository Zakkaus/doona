import {useId} from 'react';
import {LANGS, useT, type Lang} from '../../i18n';
import {Button, Card, ChoiceMenu, ErrorMessage, LabeledSelect, Light, ConfirmDialog, Switch, TextField} from '../../ui/ui';
import type {PaletteId, Scheme, Wordmark} from '../../shell/preferences';
import {useSettingsPage} from './useSettingsPage';
import {useSignOut} from './useSignOut';
import {RuntimeSettingsCard} from './RuntimeSettings';
import {BackendActionsCard} from './BackendActions';
import {GeodataSettingsCard} from './GeodataSettings';
import {About} from '../../shell/About';
import type {PageProps} from '../../shell/routes';
import {settingsCard} from './nav';

const cards = {backend: settingsCard('backend'), appearance: settingsCard('appearance'), about: settingsCard('about')};

export function Settings({query}: PageProps) {
  const t = useT();
  const session = useSignOut();
  const {
    activeId,
    hasActive,
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
    profile,
    palette,
    tokenType,
    tokenToggleText,
    toggleToken,
    versionWarning,
    install,
    installHint,
    addProfile,
    renameProfile,
    dialogTitle,
    dialogBlocked,
    dialogDiscards,
    deleteHelp
  } = useSettingsPage(query);
  const mirrorHelpId = useId();

  return (
    <div className="rp-page">
      {firstRun && <p className="rp-note">{t('settings.firstRun')}</p>}
      {paired && <p className="rp-note">{t('settings.paired')}</p>}
      <Card level={2} title={t(cards.backend.titleKey)} titleId={cards.backend.headingId}>
        <ErrorMessage error={error} onRetry={retry} />
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
        <form
          className="rp-form"
          noValidate
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            label={t('settings.api')}
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
            <Button type="submit" accent isPending={saving}>
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
      <RuntimeSettingsCard />
      <GeodataSettingsCard />
      <BackendActionsCard />
      <Card level={2} title={t(cards.appearance.titleKey)} titleId={cards.appearance.headingId}>
        <div className="rp-toolbar">
          <LabeledSelect label={t('lang')} value={lang} onChange={value => pickLang(value as Lang)} items={LANGS.map(([id, label]) => ({id, label}))} />
          <div className="rp-field">
            <span className="lbl">{t('palette')}</span>
            <ChoiceMenu
              label={t('palette')}
              sections={paletteSections.map(section => ({...section, value: ap.palette, onChange: (value: string) => ap.pickPalette(value as PaletteId)}))}
            >
              {palette}
            </ChoiceMenu>
          </div>
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
            label={t('wordmark')}
            value={ap.wordmark}
            onChange={value => ap.pickWordmark(value as Wordmark)}
            items={[
              {id: 'gradient', label: t('wordmark.gradient')},
              {id: 'plain', label: t('wordmark.plain')}
            ]}
          />
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
      <Card level={2} title={t(cards.about.titleKey)} titleId={cards.about.headingId}>
        {versionWarning && (
          <Light small tone="warn">
            {versionWarning}
          </Light>
        )}
        <div className="rp-cluster">
          <About trigger={<Button>{t('about.title')}</Button>} />
          {install && <Button onPress={install}>{t('settings.install')}</Button>}
          {installHint && <p className="rp-note">{installHint}</p>}
        </div>
      </Card>
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
