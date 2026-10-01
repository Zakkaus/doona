import {sourceForms} from './sourceForms';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {useCapabilities, useConfig, useConfigEditor, useVersion, useRules, useDnsRules, useGroups} from '../../store';
import {readGroupEntries} from '../../dae/groups';
import {groupQuery} from '../shared/link';
import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../../api/model';
import {ApiError} from '../../api/error';
import {downloadFile, isMac, toast, toastFailure, useLinked} from '../../ui/ui';
import {allGroupNames, fileName, restartRequired} from '../../dae/sources';
import type {PageProps} from '../../shell/routes';
import {buildHash, href, pickTab, tabQuery, within} from '../../shell/route';
import {
  configMetadata,
  saveReason,
  saveView,
  validateReason,
  sourceView,
  diagnosticRows,
  diagnosticSummary,
  diagnosticsOpen,
  sourceMarks,
  readOnlyBadge,
  type DiagnosticRow,
  type DiagnosticsChoice
} from './view';
import {configTabs} from './nav';
import {useDraftGuard} from '../../shell/draft';
import {useValidationSources} from './useValidationSources';
import {useCompleteness} from '../../store/config';
import {useBackgroundValidation} from './useBackgroundValidation';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import type {NewSourceProps} from './useNewSource';
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
      const restart = restartRequired(diagnostics);
      toast('negative', restart ? t('config.writeRestart', {n: restart}) : t('ui.writeInvalid', {n: diagnostics.filter(d => d.level === 'error').length}));
    } else toastFailure(editor.error, t, t('ui.writeFailed'));
  }, [editor.error, diagnostics, t]);
  return {...editor, diagnostics};
}

// Keyed by source id, which is the backend's text: a plain object would answer `constructor` from its prototype.
const noChoices: ReadonlyMap<string, DiagnosticsChoice> = new Map();

export function useConfigPage({go, query}: PageProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const config = useConfig(offered(resources, 'config', {whileLoading: true}));
  const editor = useConfigEditorController(config.refetch);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const mainSource = sources.find(item => item.kind === 'main') ?? null;
  // A stale link to a source that no longer exists opens the first one rather than an empty card.
  const source = sources.find(item => item.id === params.get('source')) ?? sources[0] ?? null;
  const selectedId = source?.id ?? null;
  const select = (id: string | null) => go('config', within(query, {source: id, line: null}));
  const openSource = (sourceId: string, line: number | null) =>
    go('config', within(query, {tab: 'source', source: sourceId, line: line === null ? null : String(line)}));
  const focusLine = Number(params.get('line')) || null;
  const sourceDiagnostics = config.data?.diagnostics ?? [];
  const counts = useMemo(() => {
    const all = config.data?.diagnostics ?? [];
    return {error: all.filter(d => d.level === 'error').length, warning: all.filter(d => d.level === 'warning').length};
  }, [config.data]);
  const canValidate = offered(resources, 'config_validate', {whileLoading: false}) && (resources?.config_validate.modes ?? []).includes('full');
  const configWritable = resources?.config.writable === true;
  const isComplete = useCompleteness(sources);
  // The engine names the secrets that make a source read-only.
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  const tabs = configTabs(!!engine.globalSettings);
  const readOnly = source ? readOnlyBadge(source, configWritable, isComplete(source), engine, t) : null;
  const canWrite = !!source && !readOnly;
  // Each source keeps the person's last open or collapse of its diagnostics, and the card reports the errors it shows
  // for the tab, a draft's included; away from the card the tab counts the accepted configuration's.
  const [choices, setChoices] = useState<ReadonlyMap<string, DiagnosticsChoice>>(noChoices);
  const [shownErrors, setShownErrors] = useState<number | null>(null);
  const tabErrors = shownErrors ?? counts.error;
  const fallback = params.has('source') || mainSource?.content === undefined ? 'source' : 'modules';
  const tab = pickTab(
    params.get('tab') === 'validate' ? within(query, {tab: 'source'}) : query,
    tabs.map(item => item.id),
    fallback
  );
  const sourceProps: SourceCardProps | null = source
    ? {
        source,
        sources,
        open: openSource,
        diagnostics: sourceDiagnostics,
        canValidate: canValidate && (source.kind === 'main' || source.kind === 'include'),
        canWrite,
        readOnly,
        isComplete,
        editor,
        focusLine,
        generation: config.data?.generation_id ?? '',
        focusDiagnostics: params.get('tab') === 'validate',
        diagnosticsChoice: choices.get(source.id) ?? null,
        chooseDiagnostics: choice => setChoices(previous => new Map(previous).set(source.id, choice)),
        reportErrors: setShownErrors
      }
    : null;
  const newSourceProps: NewSourceProps | null =
    resources?.config.create === true && resources.config.writable === true ? {sources, refetch: config.refetch, open: id => openSource(id, null)} : null;
  return {
    error: config.error,
    reload: config.refetch,
    loading: config.loading && !config.data,
    ready: !!config.data,
    metadata: config.data ? configMetadata(config.data.revision, t) : [],
    redacted: !!config.data?.secrets_redacted,
    tabs: tabs.map(item => ({
      id: item.id,
      label: item.id === 'source' && tabErrors ? t('ui.aside', {text: t(item.titleKey), note: formatNumber(tabErrors, locale)}) : t(item.titleKey)
    })),
    tab,
    setTab: (tab: string) => go('config', within(tabQuery(query, tab, null), {field: null})),
    selectedId: selectedId ?? '',
    select,
    sourceProps,
    newSourceProps,
    modulesProps: config.data ? {config: config.data} : null,
    sourceModel: source ? {...sourceView(source, locale, t), readOnly} : null,
    sourceOptions: sources.map(item => {
      const view = sourceView(item, locale, t);
      return {id: view.id, label: view.label, desc: view.kind};
    }),
    exportSource: () => {
      if (source) downloadFile(fileName(source), source.content, 'text/plain;charset=utf-8');
    },
    summaryTone: counts.error ? ('err' as const) : counts.warning ? ('warn' as const) : ('ok' as const),
    summaryText: counts.error ? t('config.errors', {n: counts.error}) : counts.warning ? t('config.warnings', {n: counts.warning}) : t('config.clean')
  };
}
export type SourceCardProps = {
  source: ConfigSource;
  sources: ConfigSource[];
  open: (sourceId: string, line: number | null) => void;
  diagnostics: ConfigDiagnostic[];
  canValidate: boolean;
  canWrite: boolean;
  readOnly: ReturnType<typeof readOnlyBadge>;
  isComplete: (source: ConfigSource) => boolean | undefined;
  editor: ConfigEditor;
  focusLine: number | null;
  generation: string;
  focusDiagnostics: boolean;
  diagnosticsChoice: DiagnosticsChoice | null;
  chooseDiagnostics: (choice: DiagnosticsChoice) => void;
  reportErrors: (errors: number | null) => void;
};

export function useSourceCard({
  source,
  sources,
  diagnostics,
  canValidate,
  canWrite,
  readOnly,
  isComplete,
  editor,
  focusLine,
  generation,
  open,
  diagnosticsChoice,
  chooseDiagnostics,
  reportErrors
}: SourceCardProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const engine = engineOf(useVersion().data);
  const capabilities = useCapabilities().data?.resources;
  const routing = useRules(!!focusLine && capabilities?.rules.available === true).data;
  const dns = useDnsRules(!!focusLine && capabilities?.dns_rules.available === true).data;
  const groups = useGroups(!!focusLine && capabilities?.groups.available === true).data;
  const locatedGroup = focusLine ? readGroupEntries(source.content).find(entry => entry.from < focusLine && entry.to >= focusLine - 1) : undefined;
  const groupLink = locatedGroup && groupQuery(groups, locatedGroup.name);
  const rule = routing?.rules.find(rule => rule.source?.source_id === source.id && rule.source.line === focusLine);
  const dnsList = dns?.request.some(rule => rule.source?.source_id === source.id && rule.source.line === focusLine) ? 'request' : 'response';
  const dnsRule = dns?.[dnsList].find(rule => rule.source?.source_id === source.id && rule.source.line === focusLine);

  // The text typed over the loaded source; null while it is unchanged. If-Match uses the draft's original digest to
  // reject changes made on disk while editing.
  const [draft, setDraft] = useState<{text: string; origin: ConfigSource} | null>(null);
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  // Editable until busy; while the digest check is pending the text is not known to be whole yet.
  const writable = canWrite && isComplete(source) === true;
  // The read-only notice shows once for this source; the card remounts when another source is chosen.
  const told = useRef(false);
  const saveErrors = editor.errorSource === source.id ? editor.diagnostics : null;
  const shown = useMemo(() => saveErrors ?? found ?? (draft ? [] : diagnostics), [saveErrors, found, draft, diagnostics]);
  useLinked(generation, () => setFound(null));
  const marks = useMemo(() => sourceMarks(shown, source.id, t), [shown, source.id, t]);
  const text = draft?.text ?? source.content ?? '';
  // Names to complete after "->": the groups of every source, this one as edited.
  const outbounds = () => allGroupNames(sources, {id: source.id, content: text});
  // A line the card moves the editor to; the key makes a second request for the same line move it again.
  const [jump, setJump] = useState<{line: number; key: number} | null>(null);
  const jumps = useRef(0);
  const jumpTo = (line: number | null) => setJump(line === null ? null : {line, key: ++jumps.current});
  // A line asked for through the address (a diagnostic in another source) wins over the last validation's first error.
  useLinked(focusLine, () => setJump(null));
  const dirty = draft !== null && draft.text !== source.content;
  // The file changed on disk under the draft, whether a refetch or a refused save showed it. Saving waits until the
  // person keeps the draft over the new text or cancels it, since the draft would replace a change they have not seen.
  const conflict = dirty && draft.origin.content_sha256 !== source.content_sha256;
  const guard = useDraftGuard(dirty, () => {
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
    jumpTo(first ? first.line : null);
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
    if (draft === null || editor.busy || !writable || conflict) return;
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
  const cancel = () => {
    editor.cancel();
    setDraft(null);
    setFound(null);
  };
  // Typing back to the loaded text leaves nothing to save, so it ends the draft as a cancel does.
  const change = (value: string) => {
    editor.cancel();
    if (value === source.content) cancel();
    else {
      setFound(null);
      setDraft(prev => ({text: value, origin: prev?.origin ?? source}));
    }
  };
  const refused = readOnly
    ? () => {
        if (told.current) return;
        told.current = true;
        toast('info', t('config.readOnlyAttempt'), {detail: readOnly.note});
      }
    : undefined;
  const view = sourceView(source, locale, t);
  const checkedDraft = found !== null || saveErrors !== null;
  const rows = useMemo(() => diagnosticRows(shown, sources, locale, t, source.id), [shown, sources, locale, t, source.id]);
  const summary = diagnosticSummary(rows);
  const pending = dirty && !checkedDraft;
  useEffect(() => reportErrors(pending ? null : summary.errors), [reportErrors, pending, summary.errors]);
  useEffect(() => () => reportErrors(null), [reportErrors]);
  return {
    writable,
    links: groupLink
      ? [{from: 0, to: 0, line: focusLine!, label: locatedGroup!.name, href: buildHash('policies', groupLink)}]
      : rule || dnsRule
        ? [
            {
              from: 0,
              to: 0,
              line: focusLine!,
              label: rule?.expression ?? dnsRule!.expression,
              href: href('rules', {
                tab: rule ? 'list' : 'dns',
                view: rule ? 'advanced' : null,
                edit: rule?.rule_id ?? dnsRule!.rule_id,
                list: rule ? null : dnsList
              })
            }
          ]
        : sourceForms(text, source.id, engine, source.kind),
    note: readOnly?.note ?? t(canValidate ? 'config.editNoteValidate' : 'config.editNote'),
    refused,
    diagnostics: {
      rows,
      errors: summary.errors,
      warnings: summary.warnings,
      scope: dirty ? t('config.draftDiagnostics') : checkedDraft ? t('config.fileDiagnostics') : t('config.acceptedDiagnostics', {generation}),
      // One quiet line instead of the bar: a draft not checked yet, or nothing to report.
      quiet: pending ? t('config.draftPending') : rows.length ? null : t('config.clean'),
      open: diagnosticsOpen(summary.errorKeys, diagnosticsChoice),
      setOpen: (open: boolean) => chooseDiagnostics({open, errorKeys: summary.errorKeys}),
      go: (row: DiagnosticRow) => {
        if (row.action === 'jump') jumpTo(row.line);
        else if (row.action === 'open') open(row.sourceId, row.line);
      }
    },
    marks,
    text,
    outbounds,
    focus: jump?.line ?? focusLine,
    focusKey: jump?.key ?? 0,
    dirty,
    conflict: conflict ? t('config.changedOnDisk') : null,
    keep: () => setDraft(current => current && {...current, origin: source}),
    validate,
    save,
    cancel,
    change,
    view,
    busy: !!editor.busy,
    validating: editor.busy === 'validate',
    saving: editor.busy === 'save',
    saveButton: conflict ? {disabled: true, tip: t('config.changedOnDisk')} : saveView(editor.busy, writable, readOnly?.note ?? null, isMac, t),
    validateDisabled: !!editor.busy || !candidates,
    // Save shows only with a draft; a refetch that made the source read-only while it was open says so here, since the
    // draft's hint replaces the read-only line.
    reason: dirty
      ? !writable && readOnly
        ? readOnly.note
        : saveReason({busy: !!editor.busy, conflict: !!conflict}, t)
      : canValidate && !editor.busy
        ? validateReason(candidates, sources, isComplete, t)
        : null
  };
}
