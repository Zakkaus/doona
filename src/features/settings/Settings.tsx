import {Menu, MenuSection, Header} from 'react-aria-components';
import {LANGS, useT, type Lang} from '../../i18n';
import {Button, ErrorMessage, LabeledSelect, Light, MenuButton, MenuChoice, pickMenuKey, ModalDialog, TextField} from '../../ui/ui';
import type {PaletteId, Scheme, Wordmark} from './settings';
import {useSettingsPage} from './useSettingsPage';
import {RuntimeSettingsCard} from './RuntimeSettings';
import {BackendActionsCard} from './BackendActions';
import {About} from '../../shell/About';
import type {PageProps} from '../types';

export function Settings({query}: PageProps) {
  const t = useT();
  const {
    activeId,
    hasActive,
    firstRun,
    error,
    api,
    changeApi,
    token,
    changeToken,
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
    addProfile,
    renameProfile,
    dialogTitle,
    dialogBlocked,
    deleteHelp
  } = useSettingsPage(query);

  return (
    <div className="rp-page">
      {firstRun && <div className="rp-label">{t('settings.firstRun')}</div>}
      {paired && <div className="rp-label">{t('settings.paired')}</div>}
      <section className="rp-card" aria-labelledby="settings-backend">
        <h2 className="rp-h3" id="settings-backend">
          {t('settings.backend')}
        </h2>
        <ErrorMessage error={error} />
        <div className="rp-toolbar">
          <LabeledSelect label={t('settings.profile')} side value={activeId} isDisabled={!hasActive} items={profile.choices} onChange={save} />
          <Button onPress={addProfile}>{t('settings.addProfile')}</Button>
          <Button isDisabled={!hasActive} onPress={renameProfile}>
            {t('settings.renameProfile')}
          </Button>
          <Button isDisabled={!hasActive} onPress={() => setDialog('delete')}>
            {t('settings.deleteProfile')}
          </Button>
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
          <TextField
            label={t('settings.token')}
            autoComplete="off"
            spellCheck={false}
            action={<Button onPress={toggleToken}>{tokenToggleText}</Button>}
            name="token"
            type={tokenType}
            value={token}
            onChange={changeToken}
          />
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
      </section>
      <RuntimeSettingsCard />
      <BackendActionsCard />
      <section className="rp-card" aria-labelledby="settings-appearance">
        <h2 className="rp-h3" id="settings-appearance">
          {t('settings.appearance')}
        </h2>
        <div className="rp-toolbar">
          <LabeledSelect label={t('lang')} value={lang} onChange={value => pickLang(value as Lang)} items={LANGS.map(([id, label]) => ({id, label}))} />
          <div className="rp-field">
            <span className="lbl">{t('palette')}</span>
            <MenuButton
              label={t('palette')}
              content={
                <Menu aria-label={t('palette')}>
                  {paletteSections.map(section => (
                    <MenuSection
                      key={section.title}
                      id={section.title}
                      selectionMode="single"
                      selectedKeys={[ap.palette]}
                      onSelectionChange={pickMenuKey(value => ap.pickPalette(value as PaletteId))}
                    >
                      <Header className="rp-sec-h">{section.title}</Header>
                      {section.items.map(item => (
                        <MenuChoice key={item.id} item={item} />
                      ))}
                    </MenuSection>
                  ))}
                </Menu>
              }
            >
              {palette}
            </MenuButton>
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
      </section>
      <section className="rp-card" aria-labelledby="settings-about">
        <h2 className="rp-h3" id="settings-about">
          {t('settings.about')}
        </h2>
        {versionWarning && (
          <Light small tone="warn">
            {versionWarning}
          </Light>
        )}
        <div className="rp-cluster">
          <About trigger={<Button>{t('about.title')}</Button>} />
          {install && <Button onPress={install}>{t('settings.install')}</Button>}
        </div>
      </section>
      {dialog && (
        <ModalDialog
          title={dialogTitle}
          isOpen
          narrow
          alert={dialog === 'delete'}
          onOpenChange={open => {
            if (!open) setDialog(null);
          }}
          footer={() => (
            <>
              <Button onPress={() => setDialog(null)}>{t('ui.cancel')}</Button>
              <Button accent={dialog !== 'delete'} negative={dialog === 'delete'} isDisabled={dialogBlocked} onPress={confirmProfile}>
                {t(dialog === 'delete' ? 'settings.deleteProfile' : 'settings.save')}
              </Button>
            </>
          )}
        >
          {dialog === 'delete' ? <p>{deleteHelp}</p> : <TextField label={t('settings.profileName')} value={name} onChange={setName} />}
          {profile.result?.error && <p role="alert">{profile.result.text}</p>}
        </ModalDialog>
      )}
    </div>
  );
}
