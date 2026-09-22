import {useEffect, useMemo, useState} from 'react';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {ConfigSource} from '../../api/model';
import type {ConfigEditor} from './useConfigPage';
import {useSourceComplete} from '../../store/config';
import {errorText, toast, useLinked} from '../../ui/ui';
import {validSubscriptions, writeState, type RuleTemplate, type WizardState} from './wizard';
import {wizardInitial, wizardRows} from './view';
import {useDraftGuard} from './useDraftGuard';
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
export function useWizard({main, editor, onDone}: {main: ConfigSource; editor: ConfigEditor; onDone: () => void}) {
  const t = useT();
  // Keep the accepted snapshot so a concurrent file change is rejected by If-Match.
  const [origin, setOrigin] = useState(() => main);
  const complete = useSourceComplete(origin);
  const current = origin.content ?? '';
  const [state, setState] = useState<WizardState>(() => wizardInitial(current));
  const baseline = useMemo(() => writeState(current, wizardInitial(current)), [current]);
  const preview = useMemo(() => {
    try {
      return {text: complete ? writeState(current, state) : current, error: null};
    } catch (error) {
      return {text: current, error};
    }
  }, [complete, current, state]);
  const {text} = preview;
  const busy = !!editor.busy;
  const dirty = preview.error !== null || (complete === true && text !== baseline);
  const guard = useDraftGuard(dirty);
  useLinked(guard.revision, () => {
    setOrigin(main);
    setState(wizardInitial(main.content ?? ''));
  });
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  const valid = validSubscriptions(state.subscriptions);
  const patch = (next: Partial<WizardState>) => setState(prev => ({...prev, ...next}));
  // Editing a line hands it to the form; the original text is no longer written back for it.
  const setSubscription = (index: number, value: Partial<WizardState['subscriptions'][number]>) =>
    patch({subscriptions: state.subscriptions.map((item, i) => (i === index ? {...item, ...value, raw: undefined} : item))});
  const apply = async () => {
    if (busy || !valid) return;
    if (preview.error) {
      toast('negative', errorText(preview.error));
      return;
    }
    const result = await editor.apply(origin, text);
    if (!result) return;
    if (result.diagnostics) {
      toast('negative', t('config.invalid', {n: String(result.diagnostics.filter(d => d.level === 'error').length)}));
      return;
    }
    toast('positive', t('config.saved', {path: main.path}));
    guard.clear();
    onDone();
  };
  const rows = wizardRows(state, preview.error ? errorText(preview.error) : undefined, t);
  return {
    state,
    current,
    text,
    busy,
    rows: rows.rows,
    groupUsedText: rows.groupUsedText,
    patch,
    setSubscription,
    apply,
    saveDisabled: !complete || !valid || busy || !dirty,
    saving: editor.busy === 'save',
    saveTip: complete === false ? t('config.incomplete') : undefined,
    writeHelp: current.trim() ? t('config.wizardWriteHelp', {path: main.path}) : null,
    showLan: !current.trim(),
    templates: [
      ...(current.trim() ? [{id: 'keep', label: t('config.wizardKeep'), desc: t('config.wizardKeepHelp')}] : []),
      ...templateIds.map(id => ({id, label: t(templateLabels[id][0]), desc: t(templateLabels[id][1])}))
    ],
    add: () => patch({subscriptions: [...state.subscriptions, {name: `sub-${state.subscriptions.length + 1}`, url: ''}]}),
    remove: (index: number) => patch({subscriptions: state.subscriptions.filter((_, i) => i !== index)})
  };
}
