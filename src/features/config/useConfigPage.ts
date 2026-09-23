import {useEffect, useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {useCapabilities, useConfig, useConfigEditor} from '../../store';
import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest, ConfigValidationResult, EffectiveConfig} from '../../api/model';
import {ApiError, errorText} from '../../api/error';
import {localTime} from '../../api/selectors';
import {downloadFile, isMac, toast, useLinked} from '../../ui/ui';
import {fileName, groupNames} from './names';
import type {PageProps} from '../types';
import {pickTab, within} from '../../shell/route';
import {sourceView, diagnosticRows, sourceMarks} from './view';
import {useDraftGuard} from '../../shell/draft';
import {useValidationSources} from './useValidationSources';
import {useCompleteness} from '../../store/config';
import {useBackgroundValidation} from './useBackgroundValidation';
export type ConfigEditor = {
  busy: 'save' | 'validate' | null;
  error: unknown;
  errorSource: string | null;
  diagnostics: ConfigDiagnostic[] | null;
  cancel: () => void;
  validate: (request: ConfigValidationRequest) => Promise<ConfigValidationResult | undefined>;
  apply: (source: ConfigSource, content: string) => Promise<{diagnostics?: ConfigDiagnostic[]} | undefined>;
};
function useConfigEditorController(refetch: () => void) {
  const t = useT();
  const editor = useConfigEditor(refetch);
  const diagnostics = useMemo(
    () =>
      editor.error instanceof ApiError && editor.error.status === 422
        ? ((editor.error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics ?? [])
        : null,
    [editor.error]
  );
  useEffect(() => {
    if (!editor.error) return;
    if (diagnostics) {
      toast('negative', t('config.invalid', {n: diagnostics.filter(d => d.level === 'error').length}));
    } else toast('negative', errorText(editor.error, t));
  }, [editor.error, diagnostics, t]);
  return {...editor, diagnostics};
}

export function useConfigPage({go, query}: PageProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const config = useConfig(resources?.config.available !== false);
  const editor = useConfigEditorController(config.refetch);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const mainSource = sources.find(item => item.kind === 'main') ?? null;
  // Quick setup needs a writable main source with its text; a redacted text is shown but cannot be written back.
  const setupAvailable = !!mainSource && resources?.config.writable === true && mainSource.writable && mainSource.content !== undefined;
  const canValidate = resources?.config_validate.available === true && (resources.config_validate.modes ?? []).includes('full');
  const fallback = params.has('source') || mainSource?.content === undefined ? 'source' : !mainSource.content.trim() && setupAvailable ? 'setup' : 'modules';
  const tab = pickTab(query, ['modules', 'source', 'validate', ...(setupAvailable ? ['setup'] : [])], fallback);
  // A stale link to a source that no longer exists opens the first one rather than an empty card.
  const source = sources.find(item => item.id === params.get('source')) ?? sources[0] ?? null;
  const selectedId = source?.id ?? null;
  const select = (id: string | null) => go('config', within(query, {source: id, line: null}));
  const openSource = (sourceId: string, line: number | null) =>
    go('config', within(query, {tab: 'source', source: sourceId, line: line === null ? null : String(line)}));
  const n = (value: number) => formatNumber(value, locale);
  const focusLine = Number(params.get('line')) || null;
  const groupList = useMemo(() => groupNames(mainSource?.content ?? ''), [mainSource]);
  const sourceDiagnostics = useMemo(() => (config.data?.diagnostics ?? []).filter(item => item.source_id === selectedId), [config.data, selectedId]);
  const counts = useMemo(() => {
    const all = config.data?.diagnostics ?? [];
    return {error: all.filter(d => d.level === 'error').length, warning: all.filter(d => d.level === 'warning').length};
  }, [config.data]);
  const sourceProps: SourceCardProps | null = source
    ? {
        source,
        sources,
        open: openSource,
        diagnostics: sourceDiagnostics,
        canValidate,
        canWrite: resources?.config.writable === true && source.writable,
        contentOffered: resources?.config.content === true,
        editor,
        groups: groupList,
        focusLine
      }
    : null;
  const wizardProps =
    setupAvailable && mainSource ? {main: mainSource, editor, onDone: () => go('config', within(query, {tab: 'source', source: mainSource.id}))} : null;
  const validateProps: ValidateTabProps | null = config.data
    ? {
        config: config.data,
        editor,
        canValidate,
        open: openSource
      }
    : null;
  return {
    error: config.error,
    reload: config.refetch,
    loading: config.loading && !config.data,
    ready: !!config.data,
    metadata: config.data
      ? ([
          [t('config.generation'), config.data.generation_id],
          [t('config.revision'), config.data.revision]
        ] as Array<[string, string]>)
      : [],
    redacted: !!config.data?.secrets_redacted,
    tab,
    setTab: (tab: string) => go('config', within(query, {tab})),
    selectedId: selectedId ?? '',
    select,
    sourceProps,
    wizardProps,
    modulesProps: config.data
      ? {
          config: config.data,
          editor,
          canWrite: resources?.config.writable === true,
          canValidate,
          open: openSource
        }
      : null,
    validateProps,
    sourceModel: source ? sourceView(source, locale, t) : null,
    sourceOptions: sources.map(item => {
      const view = sourceView(item, locale, t);
      return {id: view.id, label: view.label, desc: view.kind};
    }),
    exportSource: () => {
      if (source?.content !== undefined) downloadFile(fileName(source), source.content, 'text/plain;charset=utf-8');
    },
    summaryTone: counts.error ? ('err' as const) : counts.warning ? ('warn' as const) : ('ok' as const),
    summaryText: counts.error ? t('config.errors', {n: n(counts.error)}) : counts.warning ? t('config.warnings', {n: n(counts.warning)}) : t('config.clean')
  };
}
export type SourceCardProps = {
  source: ConfigSource;
  sources: ConfigSource[];
  open: (sourceId: string, line: number | null) => void;
  diagnostics: ConfigDiagnostic[];
  canValidate: boolean;
  canWrite: boolean;
  contentOffered: boolean;
  editor: ConfigEditor;
  groups: string[];
  focusLine: number | null;
};

export function useSourceCard({source, sources, diagnostics, canValidate, editor, groups, focusLine}: SourceCardProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  // If-Match uses the draft's original digest to reject changes made on disk while editing.
  const [draft, setDraft] = useState<{text: string; origin: ConfigSource} | null>(null);
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  const isComplete = useCompleteness(sources);
  const complete = isComplete(source);
  const editing = draft !== null;
  const saveErrors = editor.errorSource === source.id ? editor.diagnostics : null;
  const shown = saveErrors ?? found ?? diagnostics;
  const marks = useMemo(() => sourceMarks(shown, source.id), [shown, source.id]);
  const text = draft?.text ?? source.content ?? '';
  // Names to complete after "->": the groups in the text being edited, else the running configuration's.
  const outbounds = () => {
    const own = groupNames(text);
    return own.length ? own : groups;
  };
  const [jump, setJump] = useState<number | null>(null);
  // A line asked for through the address (a diagnostic's "open source") wins over the last validation's first error.
  useLinked(focusLine, () => setJump(null));
  const dirty = editing && draft.text !== source.content;
  const guard = useDraftGuard(dirty);
  useLinked(guard.revision, () => {
    setDraft(null);
    setFound(null);
  });
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  const draftText = draft?.text;
  const candidates = useValidationSources(sources, isComplete, {id: source.id, content: text});
  useBackgroundValidation(canValidate && draftText !== undefined ? candidates : null, setFound);
  const presentValidation = (result: Pick<ConfigValidationResult, 'valid' | 'diagnostics'>, announce = true) => {
    setFound(result.diagnostics);
    // Put the cursor on the first error so the problem is on screen, not below a long file.
    const first = result.diagnostics.find(d => d.source_id === source.id && d.level === 'error' && d.line !== null);
    setJump(first ? first.line : null);
    if (!result.valid) toast('negative', t('config.invalid', {n: result.diagnostics.filter(d => d.level === 'error').length}));
    else if (announce) toast('positive', t('config.valid'));
    return result.valid;
  };
  const validate = async () => {
    if (!candidates) return false;
    const result = await editor.validate({sources: candidates, mode: 'full'});
    return result ? presentValidation(result) : false;
  };
  const save = async () => {
    if (draft === null || editor.busy) return;
    const result = await editor.apply(draft.origin, draft.text);
    setFound(null);
    if (!result) return;
    if (result.diagnostics) {
      presentValidation({valid: false, diagnostics: result.diagnostics}, false);
      return;
    }
    toast('positive', t('config.saved', {path: sourceView(source, locale, t).label}));
    guard.clear();
    setDraft(null);
  };
  const edit = () => setDraft({text: source.content ?? '', origin: source});
  const cancel = () => {
    setDraft(null);
    setFound(null);
  };
  const change = (value: string) => setDraft(prev => (prev ? {...prev, text: value} : prev));
  const view = sourceView(source, locale, t);
  return {
    editing,
    shown: diagnosticRows(shown, sources, locale, t),
    marks,
    text,
    outbounds,
    focus: jump ?? focusLine,
    dirty,
    validate,
    save,
    edit,
    cancel,
    change,
    view,
    busy: !!editor.busy,
    validating: editor.busy === 'validate',
    saving: editor.busy === 'save',
    saveTip: t(isMac ? 'config.saveShortcutMac' : 'config.saveShortcut'),
    validateDisabled: !!editor.busy || !candidates,
    validateTip: !candidates ? t('config.incomplete') : undefined,
    editDisabled: !complete || !!editor.busy,
    editTip: complete === false ? t('config.incomplete') : undefined
  };
}

export type ValidateTabProps = {
  config: EffectiveConfig;
  editor: ConfigEditor;
  canValidate: boolean;
  open: (sourceId: string, line: number | null) => void;
};

export function useValidateTab({config, editor}: ValidateTabProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const n = (value: number) => formatNumber(value, locale);
  const [level, setLevel] = useState('all');
  const [run, setRun] = useState<ConfigValidationResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () => diagnosticRows(run?.diagnostics ?? config.diagnostics, config.sources, locale, t),
    [run, config.diagnostics, config.sources, locale, t]
  );
  const count = (which: ConfigDiagnostic['level']) => rows.filter(item => item.level === which).length;
  const errors = count('error');
  const warnings = count('warning');
  const shown = level === 'all' ? rows : rows.filter(item => item.level === level);
  const cur = rows.find(item => item.id === selected) ?? null;
  const isComplete = useCompleteness(config.sources);
  const candidates = useValidationSources(config.sources, isComplete);
  const validate = () => {
    if (!candidates) return;
    void editor.validate({sources: candidates, mode: 'full'}).then(result => {
      // A fresh list has new rows; the old selection would point at a different diagnostic.
      if (result) {
        setRun(result);
        setSelected(null);
      }
    });
  };
  return {
    level,
    setLevel,
    selected,
    setSelected,
    shown,
    cur,
    validate,
    summaryTone: errors ? ('err' as const) : warnings ? ('warn' as const) : ('ok' as const),
    summary: errors
      ? t('config.failed', {errors: t('config.errors', {n: errors}), warnings: t('config.warnings', {n: warnings})})
      : warnings
        ? t('config.passedWarnings', {n: n(warnings)})
        : t('config.passed'),
    lastRun: run ? t('config.lastRun', {time: localTime(run.validated_at, locale)}) : t('config.acceptedDiagnostics', {generation: config.generation_id}),
    validating: editor.busy === 'validate',
    blocked: !!editor.busy || !candidates,
    tip: !candidates ? t('config.incomplete') : undefined,
    levels: [
      ['all', t('config.levelAll', {n: n(rows.length)})],
      ['error', t('config.levelErrors', {n: n(errors)})],
      ['warning', t('config.levelWarnings', {n: n(warnings)})],
      ['info', t('config.levelInfo', {n: n(count('info'))})]
    ] as Array<[string, string]>
  };
}
