import {useEffect, useMemo, useState} from 'react';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {ConfigSource} from '../../api/model';
import type {useConfigEditor} from '../../api/store';
import {Button, LabeledSelect, TextField, toast} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {candidate} from './names';
import {defaultGroup, defaultTemplate, isSubscriptionUrl, readState, writeState, type RuleTemplate, type WizardState} from './wizard';

const templateIds: RuleTemplate[] = ['global', 'bypass', 'gfw', 'mini', 'standard', 'full'];
const templateLabels: Record<RuleTemplate, [Key, Key]> = {
  global: ['config.wizardGlobal', 'config.wizardGlobalHelp'],
  bypass: ['config.wizardBypass', 'config.wizardBypassHelp'],
  gfw: ['config.wizardGfw', 'config.wizardGfwHelp'],
  mini: ['config.wizardMini', 'config.wizardMiniHelp'],
  standard: ['config.wizardStandard', 'config.wizardStandardHelp'],
  full: ['config.wizardFull', 'config.wizardFullHelp']
};
// Edit subscriptions and optional routing templates while preserving existing groups. Never write back redacted text whose digest does not match.
export function Wizard({
  main,
  complete,
  canValidate,
  editor,
  onDone,
  onDirty
}: {
  main: ConfigSource;
  complete: boolean | null;
  canValidate: boolean;
  editor: ReturnType<typeof useConfigEditor>;
  onDone: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const t = useT();
  // The text and digest the form started from: the preview builds on them, and the save's If-Match names the
  // digest, so a file that changed on disk while the form was open is refused rather than overwritten.
  const [origin] = useState(() => ({content: main.content ?? '', sha256: main.content_sha256}));
  const current = origin.content;
  const [state, setState] = useState<WizardState>(() => {
    const read = readState(current);
    return {
      ...read,
      rules: current.trim() ? 'keep' : defaultTemplate,
      subscriptions: read.subscriptions.length ? read.subscriptions : [{name: 'sub', url: ''}]
    };
  });
  const text = useMemo(() => writeState(current, state), [current, state]);
  const dirty = text !== current;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // Lines the form left as written are valid by definition; the ones it edited need a name and an http(s) URL.
  const valid = state.subscriptions.every(s => s.raw !== undefined || (s.name.trim() && isSubscriptionUrl(s.url)));
  const patch = (next: Partial<WizardState>) => setState(prev => ({...prev, ...next}));
  // Editing a line hands it to the form; the original text is no longer written back for it.
  const setSubscription = (index: number, value: Partial<WizardState['subscriptions'][number]>) =>
    patch({subscriptions: state.subscriptions.map((item, i) => (i === index ? {...item, ...value, raw: undefined} : item))});
  const apply = async () => {
    if (canValidate) {
      const check = await editor.validate({sources: [candidate(main, text)], mode: 'full'});
      if (!check) return;
      if (!check.valid) {
        toast('negative', t('config.invalid', {n: String(check.diagnostics.filter(d => d.level === 'error').length)}));
        return;
      }
    }
    const result = await editor.save(main.id, text, origin.sha256);
    if (!result) return;
    toast('positive', t('config.saved', {path: main.path}));
    onDone();
  };
  return (
    <section className="rp-card" aria-label={t('config.wizard')}>
      <span className="rp-label">{t('config.wizardNote')}</span>

      <h3 className="rp-h3">{t('config.wizardSubscriptions')}</h3>
      <div className="rp-list">
        {state.subscriptions.map((item, index) =>
          // A blank line is kept for the round trip but is not a row.
          item.raw !== undefined && !item.raw.trim() ? null : (
            <div className="rp-toolbar top" key={index}>
              {item.raw !== undefined && !item.name ? (
                // A line in a form the wizard does not model (a file, a multi-line entry) stays as written.
                <span className="rp-code rp-grow">{item.raw.trim()}</span>
              ) : (
                <>
                  <TextField label={t('config.wizardSubscriptionName')} value={item.name} width={140} onChange={name => setSubscription(index, {name})} />
                  <TextField
                    label={t('config.wizardSubscription')}
                    value={item.url}
                    width={520}
                    placeholder="https://example.org/sub?token=…"
                    isInvalid={item.url !== '' && !isSubscriptionUrl(item.url)}
                    error={item.url !== '' && !isSubscriptionUrl(item.url) ? t('config.wizardSubscriptionHelp') : undefined}
                    description={index === 0 ? t('config.wizardSubscriptionHelp') : undefined}
                    onChange={url => setSubscription(index, {url})}
                  />
                </>
              )}
              <Button
                quiet
                small
                label={t('config.wizardRemove', {name: item.name || item.raw?.trim() || ''})}
                onPress={() => patch({subscriptions: state.subscriptions.filter((_, i) => i !== index)})}
              >
                <Close />
              </Button>
            </div>
          )
        )}
        <div>
          <Button small onPress={() => patch({subscriptions: [...state.subscriptions, {name: `sub-${state.subscriptions.length + 1}`, url: ''}]})}>
            {t('config.wizardAddSubscription')}
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
            ...templateIds.map(id => ({id, label: t(templateLabels[id][0]), desc: t(templateLabels[id][1])}))
          ]}
        />
        {!current.trim() && (
          <TextField label={t('config.wizardLan')} value={state.lanInterface} width={140} placeholder="auto" onChange={lanInterface => patch({lanInterface})} />
        )}
      </div>
      <span className="rp-label">{t('config.wizardGroupUsed', {name: state.group ?? defaultGroup})}</span>

      <h3 className="rp-h3">{t('config.wizardPreview')}</h3>
      <CodeEditor label={t('config.wizardPreview')} value={text} readOnly compact />
      <div className="rp-toolbar">
        <Button
          accent
          isDisabled={!complete || !valid || !!editor.busy || text === current}
          isPending={editor.busy === 'save'}
          tip={complete === false ? t('config.incomplete') : undefined}
          onPress={() => void apply()}
        >
          {t('config.save')}
        </Button>
        {current.trim() !== '' && <span className="rp-label">{t('config.wizardWriteHelp', {path: main.path})}</span>}
      </div>
    </section>
  );
}
