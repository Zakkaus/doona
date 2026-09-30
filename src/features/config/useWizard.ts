import {useEffect, useMemo, useState} from 'react';
import {LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import type {ConfigEditor} from './useConfigPage';
import {useSourceComplete} from '../../store/config';
import {toast, toastErrorDetail, useLinked} from '../../ui/ui';
import {nextSubscriptionName, validNetwork, validSubscriptions, writeState, type WizardState} from '../../dae/setup';
import {isQuotable} from '../../dae/text';
import {groupsNamingTag} from '../../dae/groups';
import {type RuleTemplate} from '../../dae/templates';
import {diagnosticRows, saveReason, sourceView, wizardInitial, wizardRows, wizardUnder} from './view';
import {useDraftGuard} from '../../shell/draft';
const templateIds: RuleTemplate[] = ['global', 'bypass', 'gfw', 'mini', 'standard', 'full'];
const templateLabels: Record<RuleTemplate, [Key, Key]> = {
  global: ['config.wizardGlobal', 'config.wizardGlobalHelp'],
  bypass: ['config.wizardBypass', 'config.wizardBypassHelp'],
  gfw: ['config.wizardGfw', 'config.wizardGfwHelp'],
  mini: ['config.wizardMini', 'config.wizardMiniHelp'],
  standard: ['config.wizardStandard', 'config.wizardStandardHelp'],
  full: ['config.wizardFull', 'config.wizardFullHelp']
};
// Edits subscriptions and optional routing templates, keeping existing groups. Redacted text whose digest does not
// match is never written back.
export function useWizard({main, sources, editor, onDone}: {main: ConfigSource; sources: ConfigSource[]; editor: ConfigEditor; onDone: () => void}) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
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
  // What was just written, until the form changes again. It is no draft: the reload that follows the save, or any later
  // change to the file, loads the file into the form.
  const [saved, setSaved] = useState(false);
  const dirty = !saved && (preview.error !== null || (complete === true && text !== baseline));
  // An empty file is written as generated, so the untouched form is already something to save; it does not count as
  // a draft to guard.
  const pending = dirty || (complete === true && !current.trim());
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  // Start over from the file as loaded now.
  const reset = () => {
    setOrigin(main);
    setState(wizardInitial(main.content ?? ''));
    setFound(null);
  };
  const guard = useDraftGuard(dirty, reset);
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  // The file changed on disk under the form, whether a refetch or a refused save showed it. A changed form waits until
  // the person keeps it over the new text or discards it.
  const under = wizardUnder(dirty, origin, main);
  const conflict = under === 'conflict';
  useLinked(under === 'follow' ? main : null, next => {
    if (next) reset();
  });
  const label = sourceView(main, locale, t).label;
  // Groups in any source, included files as well, may cite a subscription of the main file.
  const cited = (tag: string) => [
    ...new Set([current, ...sources.filter(source => source.id !== origin.id).map(source => source.content ?? '')].flatMap(text => groupsNamingTag(text, tag)))
  ];
  const rows = wizardRows(state, lang, t, cited);
  const subscriptionsValid = validSubscriptions(state.subscriptions) && !rows.renameBlocked;
  const networkValid = !!current.trim() || validNetwork(state);
  const valid = subscriptionsValid && networkValid;
  const patch = (next: Partial<WizardState>) => {
    setFound(null);
    setSaved(false);
    setState(prev => ({...prev, ...next}));
  };
  // Editing a line hands it to the form; the original text is no longer written back for it.
  const setSubscription = (index: number, value: Partial<WizardState['subscriptions'][number]>) =>
    patch({subscriptions: state.subscriptions.map((item, i) => (i === index ? {...item, ...value, raw: undefined} : item))});
  const apply = async () => {
    if (busy || !valid || conflict) return;
    if (preview.error) {
      toast('negative', t('config.previewFailed'), toastErrorDetail(preview.error, t));
      return;
    }
    const result = await editor.apply(origin, text);
    if (!result) return;
    if (result.diagnostics) {
      setFound(result.diagnostics);
      toast('negative', t('ui.writeInvalid', {n: result.diagnostics.filter(d => d.level === 'error').length}));
      return;
    }
    toast('positive', t('config.saved', {path: label}));
    guard.clear();
    setSaved(true);
    onDone();
  };
  // A save refused with 422 carries the same diagnostics as a validation refusal.
  const diagnostics = (editor.errorSource === origin.id ? editor.diagnostics : null) ?? found ?? [];
  const dnsError = (value: string) => (isQuotable(value.trim()) ? undefined : t('config.unquotable'));
  return {
    state,
    text,
    busy,
    rows: rows.rows,
    diagnostics: diagnosticRows(diagnostics, [main], locale, t),
    defaultDnsError: dnsError(state.defaultDns),
    chinaDnsError: dnsError(state.chinaDns),
    groupUsedText: rows.groupUsedText,
    templateHelp: state.rules === 'keep' ? null : t('config.wizardPresetHelp'),
    networkError: networkValid ? undefined : t('config.wizardNetworkError'),
    patch,
    setSubscription,
    apply,
    conflict: conflict ? t('config.changedOnDisk') : null,
    keep: () => setOrigin(main),
    discard: reset,
    saveDisabled: !complete || !valid || busy || !pending || conflict,
    saving: editor.busy === 'save',
    saved,
    saveReason: saveReason(
      {
        busy,
        complete,
        conflict,
        invalid: rows.renameBlocked ?? (!subscriptionsValid ? t('config.wizardSubsInvalid') : !networkValid ? t('config.wizardNetworkError') : null)
      },
      t
    ),
    writeHelp: current.trim() ? t('config.wizardWriteHelp', {path: label}) : null,
    showLan: !current.trim(),
    templates: [
      ...(current.trim() ? [{id: 'keep', label: t('config.wizardKeep'), desc: t('config.wizardKeepHelp')}] : []),
      ...templateIds.map(id => ({id, label: t(templateLabels[id][0]), desc: t(templateLabels[id][1])}))
    ],
    add: () => patch({subscriptions: [...state.subscriptions, {name: nextSubscriptionName(state.subscriptions), url: ''}]}),
    remove: (index: number) => patch({subscriptions: state.subscriptions.filter((_, i) => i !== index)})
  };
}
