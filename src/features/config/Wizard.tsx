import {useMemo, useState} from 'react';
import {useT} from '../../i18n';
import type {ConfigSource} from '../../api/model';
import type {useConfigEditor} from '../../api/store';
import {Button, LabeledSelect, Segmented, TextField, toast} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {isSubscriptionUrl, readState, writeState, type GroupSpec, type WizardState} from './wizard';

// Subscriptions and groups as lists, the way daed does it; rules stay text (kept, or swapped for a template).
// The form starts from what the main source says and writes back only the sections it owns.
export function Wizard({main, editor, onDone}: {main: ConfigSource; editor: ReturnType<typeof useConfigEditor>; onDone: () => void}) {
  const t = useT();
  const current = main.content ?? '';
  const [state, setState] = useState<WizardState>(() => {
    const read = readState(current);
    return {
      ...read,
      subscriptions: read.subscriptions.length ? read.subscriptions : [{name: 'sub', url: ''}],
      groups: read.groups.length ? read.groups : [{name: 'proxy', policy: 'auto', subscriptions: ['sub']}]
    };
  });
  const text = useMemo(() => writeState(current, state), [current, state]);
  const subscriptionsValid = state.subscriptions.length > 0 && state.subscriptions.every(s => s.name.trim() && isSubscriptionUrl(s.url));
  const groupsValid = state.groups.length > 0 && state.groups.every(g => g.name.trim());
  const valid = subscriptionsValid && groupsValid;
  const patch = (next: Partial<WizardState>) => setState(prev => ({...prev, ...next}));
  const setSubscription = (index: number, value: Partial<WizardState['subscriptions'][number]>) =>
    patch({subscriptions: state.subscriptions.map((item, i) => (i === index ? {...item, ...value} : item))});
  // Any edit to a group hands it to the form; its original line is no longer written back.
  const setGroup = (index: number, value: Partial<GroupSpec>) =>
    patch({groups: state.groups.map((item, i) => (i === index ? {...item, ...value, raw: undefined} : item))});
  const apply = async () => {
    const check = await editor.validate({sources: [{id: main.id, path: main.path, content: text}], mode: 'full'});
    if (!check) return;
    if (!check.valid) {
      toast('negative', t('config.invalid', {n: String(check.diagnostics.filter(d => d.level === 'error').length)}));
      return;
    }
    const result = await editor.save(main.id, text, main.content_sha256);
    if (!result) return;
    toast('positive', t('config.saved', {path: main.path}));
    onDone();
  };
  return (
    <section className="rp-card" aria-label={t('config.wizard')}>
      <span className="rp-label">{t('config.wizardNote')}</span>

      <h3 className="rp-h3">{t('config.wizardSubscriptions')}</h3>
      <div className="rp-list">
        {state.subscriptions.map((item, index) => (
          <div className="rp-toolbar top" key={index}>
            <TextField label={t('config.wizardSubscriptionName')} value={item.name} width={140} onChange={name => setSubscription(index, {name})} />
            <TextField
              label={t('config.wizardSubscription')}
              value={item.url}
              width={520}
              placeholder="https://example.org/sub?token=…"
              isInvalid={item.url !== '' && !isSubscriptionUrl(item.url)}
              description={index === 0 ? t('config.wizardSubscriptionHelp') : undefined}
              onChange={url => setSubscription(index, {url})}
            />
            <Button
              quiet
              small
              label={t('config.wizardRemove', {name: item.name})}
              isDisabled={state.subscriptions.length === 1}
              onPress={() => patch({subscriptions: state.subscriptions.filter((_, i) => i !== index)})}
            >
              <Close />
            </Button>
          </div>
        ))}
        <div>
          <Button small onPress={() => patch({subscriptions: [...state.subscriptions, {name: `sub-${state.subscriptions.length + 1}`, url: ''}]})}>
            {t('config.wizardAddSubscription')}
          </Button>
        </div>
      </div>

      <h3 className="rp-h3">{t('config.wizardGroups')}</h3>
      <div className="rp-list">
        {state.groups.map((group, index) => (
          <div className="rp-toolbar top" key={index}>
            <TextField label={t('config.wizardGroup')} value={group.name} width={140} onChange={name => setGroup(index, {name})} />
            <LabeledSelect
              label={t('config.wizardPolicy')}
              value={group.policy}
              onChange={policy => setGroup(index, {policy: policy as GroupSpec['policy']})}
              items={[
                {id: 'auto', label: t('config.wizardAuto')},
                {id: 'manual', label: t('config.wizardManual')}
              ]}
            />
            <Segmented
              label={t('config.wizardGroupSubscriptions', {name: group.name})}
              value={group.subscriptions[0] ?? ''}
              onChange={name => setGroup(index, {subscriptions: name ? [name] : []})}
              items={[['', t('config.wizardAllNodes')], ...state.subscriptions.map((s): [string, string] => [s.name, s.name])]}
            />
            <Button
              quiet
              small
              label={t('config.wizardRemove', {name: group.name})}
              isDisabled={state.groups.length === 1}
              onPress={() => patch({groups: state.groups.filter((_, i) => i !== index)})}
            >
              <Close />
            </Button>
          </div>
        ))}
        <div>
          <Button small onPress={() => patch({groups: [...state.groups, {name: `group-${state.groups.length + 1}`, policy: 'auto', subscriptions: []}]})}>
            {t('config.wizardAddGroup')}
          </Button>
        </div>
      </div>

      <h3 className="rp-h3">{t('config.wizardTemplate')}</h3>
      <div className="rp-toolbar top">
        <LabeledSelect
          label={t('config.wizardTemplate')}
          value={state.rules}
          onChange={rules => patch({rules: rules as WizardState['rules']})}
          items={[
            ...(current.trim() ? [{id: 'keep', label: t('config.wizardKeep'), desc: t('config.wizardKeepHelp')}] : []),
            {id: 'whitelist', label: t('config.wizardWhitelist'), desc: t('config.wizardWhitelistHelp')},
            {id: 'blacklist', label: t('config.wizardBlacklist'), desc: t('config.wizardBlacklistHelp')},
            {id: 'dae', label: t('config.wizardDae'), desc: t('config.wizardDaeHelp')},
            {id: 'global', label: t('config.wizardGlobal'), desc: t('config.wizardGlobalHelp')}
          ]}
        />
        {!current.trim() && (
          <TextField label={t('config.wizardLan')} value={state.lanInterface} width={140} placeholder="auto" onChange={lanInterface => patch({lanInterface})} />
        )}
      </div>

      <h3 className="rp-h3">{t('config.wizardPreview')}</h3>
      <CodeEditor label={t('config.wizardPreview')} value={text} readOnly compact />
      <div className="rp-toolbar">
        <Button accent isDisabled={!valid || !!editor.busy || text === current} isPending={editor.busy === 'save'} onPress={() => void apply()}>
          {t('config.save')}
        </Button>
        {current.trim() !== '' && <span className="rp-label">{t('config.wizardWriteHelp', {path: main.path})}</span>}
      </div>
    </section>
  );
}
