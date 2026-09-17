import {useEffect, useMemo, useState} from 'react';
import {useT} from '../../i18n';
import type {ConfigSource} from '../../api/model';
import type {useConfigEditor} from '../../api/store';
import {Button, LabeledSelect, TextField, toast} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {defaultGroup, isSubscriptionUrl, readState, writeState, type WizardState} from './wizard';

// Subscriptions as a list, the way daed does it; rules stay text (kept, or swapped for a template). Groups are
// left as written: the templates route to the first one, and a main source without any gets a single `proxy`.
// The form starts from what the main source says and writes back only the sections it owns. `complete` is
// whether the text hashes to the accepted digest: a redacted text is never written back.
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
    return {...read, rules: current.trim() ? 'keep' : 'whitelist', subscriptions: read.subscriptions.length ? read.subscriptions : [{name: 'sub', url: ''}]};
  });
  const text = useMemo(() => writeState(current, state), [current, state]);
  // A form that would write something different is unsaved work, guarded the same way as the editor's draft.
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
      const check = await editor.validate({sources: [{id: main.id, path: main.path, content: text}], mode: 'full'});
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
        {state.subscriptions.map((item, index) => (
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
        ))}
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
