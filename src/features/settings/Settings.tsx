import {useContext, useState} from 'react';
import {Menu, MenuSection, Header} from 'react-aria-components';
import {useCapabilities, useVersion} from '../../api/store';
import {LANGS, useT, type Lang} from '../../i18n';
import {uuid} from '../../api/hash';
import {Button, ErrorMessage, LabeledSelect, Light, MenuButton, MenuChoice, pickMenuKey, ModalDialog, TextField, toast} from '../../ui/ui';
import type {PaletteId, Scheme, Wordmark} from './settings';
import {SettingsContext} from './context';
import {useBackendForm} from './backendForm';
import {RuntimeSettingsCard} from './RuntimeSettings';
import {BackendActionsCard} from './BackendActions';
import {useInstallOffer} from '../../shell/install';
import {About} from '../../shell/About';
import type {PageProps} from '../types';

export function Settings({query}: PageProps) {
  const t = useT();
  const install = useInstallOffer();
  const capabilities = useCapabilities();
  const version = useVersion();
  const controls = useContext(SettingsContext);
  const {saved, active, api, changeApi, token, changeToken, paired, invalid, result, pending, saving, persist, editedProfiles, save, testConnection} =
    useBackendForm(query);
  const [dialog, setDialog] = useState<'add' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [showToken, setShowToken] = useState(false);

  if (!controls) throw new Error('Settings requires shell controls');
  const {lang, pickLang, ap, paletteSections} = controls;
  const confirmProfile = () => {
    if (dialog === 'delete') {
      const profiles = saved.profiles.filter(profile => profile.id !== active?.id);
      persist(profiles, profiles[0]?.id ?? '');
      return;
    }
    const profiles = dialog === 'add' && !active ? [] : editedProfiles();
    if (!profiles) {
      setDialog(null);
      toast('negative', t('settings.invalidUrl'));
      return;
    }
    if (!name.trim()) return;
    if (dialog === 'add') {
      const profile = {id: uuid(), name: name.trim(), api: 'mock', token: ''};
      persist([...profiles, profile], profile.id);
    } else {
      persist(
        profiles.map(profile => (profile.id === active?.id ? {...profile, name: name.trim()} : profile)),
        saved.activeId
      );
    }
  };

  return (
    <div className="rp-col">
      {saved.api === null && <div className="rp-label">{t('settings.firstRun')}</div>}
      {paired && <div className="rp-label">{t('settings.paired')}</div>}
      <section className="rp-card" aria-labelledby="settings-backend">
        <h2 className="rp-h3" id="settings-backend">
          {t('settings.backend')}
        </h2>
        <ErrorMessage error={capabilities.error} />
        <div className="rp-toolbar">
          <LabeledSelect
            label={t('settings.profile')}
            side
            value={saved.activeId}
            isDisabled={!active}
            items={saved.profiles.map(profile => ({id: profile.id, label: profile.name}))}
            onChange={save}
          />
          <Button
            onPress={() => {
              setName('');
              setDialog('add');
            }}
          >
            {t('settings.addProfile')}
          </Button>
          <Button
            isDisabled={!active}
            onPress={() => {
              setName(active?.name ?? '');
              setDialog('rename');
            }}
          >
            {t('settings.renameProfile')}
          </Button>
          <Button isDisabled={!active} onPress={() => setDialog('delete')}>
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
            error={invalid ? t('settings.invalidUrl') : undefined}
            name="api"
            value={api}
            onChange={changeApi}
          />
          <TextField
            label={t('settings.token')}
            autoComplete="off"
            spellCheck={false}
            action={<Button onPress={() => setShowToken(value => !value)}>{t(showToken ? 'settings.hideToken' : 'settings.showToken')}</Button>}
            name="token"
            type={showToken ? 'text' : 'password'}
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
          {result && (
            <div role={result.error ? 'alert' : 'status'}>
              {t(result.key, result.params)}
              {result.requestId && <span className="rp-code"> · request_id: {result.requestId}</span>}
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
              {paletteSections.find(section => section.items.some(item => item.id === ap.palette))?.items.find(item => item.id === ap.palette)?.label ??
                ap.palette}
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
        {version.data && version.data.api.major !== 1 && (
          <Light small tone="warn">
            {t('settings.apiMajor', {major: String(version.data.api.major)})}
          </Light>
        )}
        <div className="rp-cluster">
          <About trigger={<Button>{t('about.title')}</Button>} />
          {install && (
            <Button
              onPress={() => {
                void install().then(accepted => {
                  if (accepted) toast('positive', t('settings.installed'));
                });
              }}
            >
              {t('settings.install')}
            </Button>
          )}
        </div>
      </section>
      {dialog && (
        <ModalDialog
          title={t(dialog === 'add' ? 'settings.addProfile' : dialog === 'rename' ? 'settings.renameProfile' : 'settings.deleteProfile')}
          isOpen
          narrow
          alert={dialog === 'delete'}
          onOpenChange={open => {
            if (!open) setDialog(null);
          }}
          footer={() => (
            <>
              <Button onPress={() => setDialog(null)}>{t('ui.cancel')}</Button>
              <Button accent={dialog !== 'delete'} negative={dialog === 'delete'} isDisabled={dialog !== 'delete' && !name.trim()} onPress={confirmProfile}>
                {t(dialog === 'delete' ? 'settings.deleteProfile' : 'settings.save')}
              </Button>
            </>
          )}
        >
          {dialog === 'delete' ? (
            <p>{t('settings.deleteProfileHelp', {name: active?.name ?? ''})}</p>
          ) : (
            <TextField label={t('settings.profileName')} value={name} onChange={setName} />
          )}
          {result?.error && <p role="alert">{t(result.key, result.params)}</p>}
        </ModalDialog>
      )}
    </div>
  );
}
