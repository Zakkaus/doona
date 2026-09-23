import {ApiError, errorText} from '../../api/error';
import {useEffect, useMemo, useState} from 'react';
import {LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import type {ConfigEditor} from './useConfigPage';
import {useSourceComplete} from '../../store/config';
import {toast, useLinked} from '../../ui/ui';
import {nextSubscriptionName, validNetwork, validSubscriptions, writeState, type WizardState} from '../../dae/setup';
import {isQuotable} from '../../dae/text';
import {type RuleTemplate} from '../../dae/templates';
import {diagnosticRows, sourceView, wizardInitial, wizardRows} from './view';
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
// Edit subscriptions and optional routing templates while preserving existing groups. Never write back redacted text whose digest does not match.
export function useWizard({main, editor, onDone}: {main: ConfigSource; editor: ConfigEditor; onDone: () => void}) {
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
  const dirty = preview.error !== null || (complete === true && text !== baseline);
  // An empty file is written as generated, so the untouched form is already something to save; it does not count as
  // a draft to guard.
  const pending = dirty || (complete === true && !current.trim());
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  const guard = useDraftGuard(dirty, () => {
    setOrigin(main);
    setState(wizardInitial(main.content ?? ''));
    setFound(null);
  });
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  // A save refused because the file changed on disk: the refetched file becomes the base, the form stays as typed.
  const stale = editor.error instanceof ApiError && editor.error.status === 412;
  useLinked(stale && main.content_sha256 !== origin.content_sha256 ? main : null, next => {
    if (next) setOrigin(next);
  });
  const valid = validSubscriptions(state.subscriptions) && (!!current.trim() || validNetwork(state));
  const patch = (next: Partial<WizardState>) => {
    setFound(null);
    setState(prev => ({...prev, ...next}));
  };
  // Editing a line hands it to the form; the original text is no longer written back for it.
  const setSubscription = (index: number, value: Partial<WizardState['subscriptions'][number]>) =>
    patch({subscriptions: state.subscriptions.map((item, i) => (i === index ? {...item, ...value, raw: undefined} : item))});
  const apply = async () => {
    if (busy || !valid) return;
    if (preview.error) {
      toast('negative', errorText(preview.error, t));
      return;
    }
    const result = await editor.apply(origin, text);
    if (!result) return;
    if (result.diagnostics) {
      setFound(result.diagnostics);
      toast('negative', t('config.invalid', {n: result.diagnostics.filter(d => d.level === 'error').length}));
      return;
    }
    toast('positive', t('config.saved', {path: label}));
    guard.clear();
    onDone();
  };
  const label = sourceView(main, locale, t).label;
  const rows = wizardRows(state, lang, t);
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
    networkError: !current.trim() && !validNetwork(state) ? t('config.wizardNetworkError') : undefined,
    patch,
    setSubscription,
    apply,
    saveDisabled: !complete || !valid || busy || !pending,
    saving: editor.busy === 'save',
    saveTip: complete === false ? t('config.incomplete') : undefined,
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
