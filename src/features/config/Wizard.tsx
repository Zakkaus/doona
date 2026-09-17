import {useMemo, useState} from 'react';
import {useT} from '../../i18n';
import type {ConfigSource} from '../../api/model';
import type {useConfigEditor} from '../../api/store';
import {Button, LabeledSelect, ModalDialog, Segmented, TextField, toast} from '../../ui/ui';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {buildConfig, isSubscriptionUrl, type WizardInput} from './wizard';

// Paste a subscription, pick a rule set and a policy, look at the text, apply. Replaces the main source,
// so it asks before writing over one that has content.
export function Wizard({main, editor, onDone}: {main: ConfigSource; editor: ReturnType<typeof useConfigEditor>; onDone: () => void}) {
  const t = useT();
  const [input, setInput] = useState<WizardInput>({subscription: '', group: 'proxy', policy: 'auto', template: 'domestic', lanInterface: ''});
  const text = useMemo(() => buildConfig(input), [input]);
  const valid = isSubscriptionUrl(input.subscription);
  const overwrite = (main.content ?? '').trim() !== '';
  const apply = async (): Promise<boolean> => {
    const check = await editor.validate({sources: [{id: main.id, path: main.path, content: text}], mode: 'full'});
    if (!check) return false;
    if (!check.valid) {
      toast('negative', t('config.invalid', {n: String(check.diagnostics.filter(d => d.level === 'error').length)}));
      return false;
    }
    const result = await editor.save(main.id, text, main.content_sha256);
    if (!result) return false;
    toast('positive', t('config.saved', {path: main.path}));
    onDone();
    return true;
  };
  return (
    <ModalDialog
      title={t('config.wizard')}
      trigger={<Button small>{t('config.wizard')}</Button>}
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button
            accent
            isDisabled={!valid || !!editor.busy}
            isPending={editor.busy === 'save'}
            onPress={() => {
              void apply().then(done => {
                if (done) close();
              });
            }}
          >
            {overwrite ? t('config.wizardOverwrite') : t('config.save')}
          </Button>
        </>
      )}
    >
      <span className="rp-label">{t('config.wizardNote')}</span>
      <TextField
        label={t('config.wizardSubscription')}
        value={input.subscription}
        placeholder="https://example.org/sub?token=…"
        isInvalid={input.subscription !== '' && !valid}
        description={t('config.wizardSubscriptionHelp')}
        onChange={subscription => setInput(prev => ({...prev, subscription}))}
      />
      <div className="rp-toolbar top">
        <TextField label={t('config.wizardGroup')} value={input.group} width={160} onChange={group => setInput(prev => ({...prev, group}))} />
        <LabeledSelect
          label={t('config.wizardTemplate')}
          value={input.template}
          onChange={template => setInput(prev => ({...prev, template: template as WizardInput['template']}))}
          items={[
            {id: 'domestic', label: t('config.wizardDomestic'), desc: t('config.wizardDomesticHelp')},
            {id: 'global', label: t('config.wizardGlobal'), desc: t('config.wizardGlobalHelp')}
          ]}
        />
        <TextField
          label={t('config.wizardLan')}
          value={input.lanInterface}
          width={140}
          placeholder="auto"
          onChange={lanInterface => setInput(prev => ({...prev, lanInterface}))}
        />
      </div>
      <Segmented
        label={t('config.wizardPolicy')}
        value={input.policy}
        onChange={policy => setInput(prev => ({...prev, policy: policy as WizardInput['policy']}))}
        items={[
          ['auto', t('config.wizardAuto')],
          ['manual', t('config.wizardManual')]
        ]}
      />
      <CodeEditor label={t('config.wizardPreview')} value={text} readOnly compact />
      {overwrite && <span className="rp-label">{t('config.wizardOverwriteHelp', {path: main.path})}</span>}
    </ModalDialog>
  );
}
