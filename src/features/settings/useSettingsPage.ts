import {useContext, useState} from 'react';
import {useCapabilities, useVersion} from '../../store';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';
import {SettingsContext} from '../../shell/preferences';
import {useBackendForm} from './useBackendForm';
import {profileView, paletteLabel} from './view';
import {installHint, useInstallOffer} from '../../shell/install';
export function useSettingsPage(query: string) {
  const t = useT();
  const offer = useInstallOffer();
  const capabilities = useCapabilities();
  const version = useVersion();
  const controls = useContext(SettingsContext);
  const form = useBackendForm(query);
  const [showToken, setShowToken] = useState(false);
  if (!controls) throw new Error('Settings requires shell controls');
  const {lang, pickLang, ap, paletteSections} = controls;
  const profile = profileView(form.saved.profiles, form.result, t);
  const install = offer
    ? () => {
        void offer().then(accepted => {
          if (accepted) toast('positive', t('settings.installed'));
        });
      }
    : null;
  const hint = offer ? null : installHint();
  return {
    ...form,
    lang,
    pickLang,
    ap,
    paletteSections,
    profile,
    palette: paletteLabel(paletteSections, ap.palette),
    error: capabilities.error,
    retry: capabilities.refetch,
    firstRun: form.saved.api === null,
    activeId: form.saved.activeId,
    hasActive: !!form.active,
    invalidText: form.invalid ? t('settings.invalidUrl') : undefined,
    tokenType: showToken ? 'text' : 'password',
    tokenToggleText: t(showToken ? 'settings.hideToken' : 'settings.showToken'),
    toggleToken: () => setShowToken(value => !value),
    versionWarning: version.data && version.data.api.major !== 1 ? t('settings.apiMajor', {major: String(version.data.api.major)}) : null,
    install,
    installHint: hint && t(hint === 'ios' ? 'settings.installHintIos' : 'settings.installHintMac'),
    addProfile: () => {
      form.setName('');
      form.setDialog('add');
    },
    // Add, rename and delete write the saved profiles and reload, so edits in the form are lost rather than saved.
    dialogDiscards: form.dirty,
    renameProfile: () => {
      form.setName(form.active?.name ?? '');
      form.setDialog('rename');
    },
    dialogTitle: t(form.dialog === 'add' ? 'settings.addProfile' : form.dialog === 'rename' ? 'settings.renameProfile' : 'settings.deleteProfile'),
    dialogBlocked: form.dialog !== 'delete' && !form.name.trim(),
    deleteHelp: t('settings.deleteProfileHelp', {name: form.active?.name ?? ''})
  };
}
