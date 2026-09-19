import {useEffect, useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {getApi} from '../../api';
import {useCapabilities, useConfig, useConfigEditor} from '../../api/store';
import type {ConfigDiagnostic, ConfigSource, ConfigValidationResult, EffectiveConfig} from '../../api/model';
import {ApiError} from '../../api/error';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {
  Badge,
  Button,
  DataTable,
  ErrorMessage,
  Kv,
  LabeledSelect,
  Light,
  ModalDialog,
  Segmented,
  Tabs,
  TextTooltip,
  downloadFile,
  errorText,
  toast
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import Refresh from '../../ui/icons/Refresh';
import {CodeEditor, type EditorMark} from '../../ui/code/CodeEditor';
import {candidate, groupNames} from './names';
import {Wizard} from './Wizard';
import type {PageProps} from '../types';
import {within} from '../../shell/route';
import {sha256} from '../../api/hash';

const kinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
// The backend redacts the path of a file that holds a secret; the file is then named by its kind and the
// start of its id, and exports fall back to a name by kind.
const redacted = (source: ConfigSource) => source.path === '<redacted>' || source.path === '';
const sourceName = (source: ConfigSource, t: (key: Key) => string) => (redacted(source) ? `${t(kinds[source.kind])} · ${source.id.slice(0, 8)}` : source.path);
const fileName = (source: ConfigSource) =>
  redacted(source) ? (source.kind === 'main' ? 'config.dae' : `${source.kind}-${source.id.slice(0, 8)}.dae`) : source.path.split('/').pop() || 'config.dae';

const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};

// The digest of a text, once computed; undefined until then or when there is no text.
function useSha256(text: string | undefined): string | undefined {
  const [hashed, setHashed] = useState<{text: string; hash: string} | null>(null);
  useEffect(() => {
    if (text === undefined) return;
    let live = true;
    void sha256(text).then(hash => live && setHashed({text, hash}));
    return () => {
      live = false;
    };
  }, [text]);
  return hashed !== null && hashed.text === text ? hashed.hash : undefined;
}

// The accepted configuration: its sources, the diagnostics the engine kept, and one source's text; a
// writable source with complete text can be edited and saved through validation, write and reload.
export function Config({go, query}: PageProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const config = useConfig(resources?.config.available !== false);
  const editor = useConfigEditor(config.refetch);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const mainSource = sources.find(item => item.kind === 'main') ?? null;
  // Quick setup needs a writable main source with its text; a redacted text is shown but cannot be written back.
  const setupAvailable = !!mainSource && resources?.config.writable === true && mainSource.writable && mainSource.content !== undefined;
  const mainHash = useSha256(mainSource?.content);
  const mainComplete = mainHash === undefined ? null : mainHash === mainSource?.content_sha256;
  const canValidate = resources?.config_validate.available === true && (resources.config_validate.modes ?? []).includes('full');
  const requested = params.get('tab');
  const tab = requested === 'validate' || (requested === 'setup' && setupAvailable) ? requested : 'source';
  const selectedId = params.get('source') ?? sources[0]?.id ?? null;
  const source = sources.find(item => item.id === selectedId) ?? null;
  // Leaving an edit: the browser asks on reload or close; switching source or tab asks with the kit's dialog.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);
  const navigate = (next: string) => {
    if (dirty) setPending(next);
    else go('config', next);
  };
  const select = (id: string | null) => navigate(within(query, {source: id, line: null}));
  const n = (value: number) => formatNumber(value, locale);
  const focusLine = Number(params.get('line')) || null;
  const groupList = useMemo(() => groupNames(mainSource?.content ?? ''), [mainSource]);
  const counts = useMemo(() => {
    const all = config.data?.diagnostics ?? [];
    return {error: all.filter(d => d.level === 'error').length, warning: all.filter(d => d.level === 'warning').length};
  }, [config.data]);
  useEffect(() => {
    if (!editor.error) return;
    if (editor.error instanceof ApiError && editor.error.status === 422) {
      const diagnostics = (editor.error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics ?? [];
      toast('negative', t('config.invalid', {n: String(diagnostics.filter(d => d.level === 'error').length)}));
    } else toast('negative', errorText(editor.error));
  }, [editor.error, t]);
  return (
    <div className="rp-page">
      <ErrorMessage error={config.error} />
      {config.data && (
        <div className="rp-toolbar">
          <Kv
            row
            items={[
              [t('config.generation'), config.data.generation_id],
              [t('config.revision'), config.data.revision]
            ]}
          />
          <Light small tone={counts.error ? 'err' : counts.warning ? 'warn' : 'ok'}>
            {counts.error ? t('config.errors', {n: n(counts.error)}) : counts.warning ? t('config.warnings', {n: n(counts.warning)}) : t('config.clean')}
          </Light>
          {config.data.secrets_redacted && (
            <Light small tone="muted">
              {t('config.redacted')}
            </Light>
          )}
        </div>
      )}
      {config.data && (
        <Tabs
          label={t('nav.config')}
          value={tab}
          onChange={next => navigate(within(query, {tab: next}))}
          items={[
            ...(setupAvailable && mainSource
              ? [
                  {
                    id: 'setup',
                    label: t('config.wizard'),
                    content: (
                      <Wizard
                        main={mainSource}
                        complete={mainComplete}
                        canValidate={canValidate}
                        editor={editor}
                        onDone={() => go('config', within(query, {tab: 'source', source: mainSource.id}))}
                        onDirty={setDirty}
                      />
                    )
                  }
                ]
              : []),
            {
              id: 'source',
              label: t('config.tabSource'),
              content: (
                <>
                  <div className="rp-toolbar">
                    <LabeledSelect
                      side
                      label={t('config.source')}
                      value={selectedId ?? ''}
                      onChange={select}
                      items={sources.map(item => ({id: item.id, label: sourceName(item, t), desc: t(kinds[item.kind])}))}
                    />
                    {source && (
                      <>
                        <Badge>{t(kinds[source.kind])}</Badge>
                        <Light small tone={source.writable ? 'ok' : 'muted'}>
                          {t(source.writable ? 'config.editable' : 'config.readOnly')}
                        </Light>
                        <span className="rp-label">
                          {t('config.sourceFacts', {
                            lines: n(source.line_count),
                            size: formatBytes(String(source.bytes)),
                            time: localTime(source.loaded_at, locale)
                          })}
                        </span>
                      </>
                    )}
                    {source?.content !== undefined && (
                      <>
                        <span className="rp-grow" />
                        <Button onPress={() => downloadFile(fileName(source), source.content!, 'text/plain;charset=utf-8')}>
                          <Download />
                          {t('config.export')}
                        </Button>
                      </>
                    )}
                  </div>
                  {source && (
                    <SourceCard
                      key={source.id}
                      source={source}
                      diagnostics={config.data.diagnostics.filter(d => d.source_id === source.id)}
                      canValidate={canValidate}
                      canWrite={resources?.config.writable === true && source.writable}
                      contentOffered={resources?.config.content === true}
                      editor={editor}
                      groups={groupList}
                      focusLine={focusLine}
                      onDirty={setDirty}
                    />
                  )}
                </>
              )
            },
            {
              id: 'validate',
              label: t('config.tabValidate'),
              content: (
                <ValidateTab
                  config={config.data}
                  editor={editor}
                  canValidate={canValidate}
                  open={(sourceId, line) => go('config', within(query, {tab: 'source', source: sourceId, line: line === null ? null : String(line)}))}
                />
              )
            }
          ]}
        />
      )}
      <ModalDialog
        title={t('config.discardTitle')}
        narrow
        alert
        isOpen={pending !== null}
        onOpenChange={open => {
          if (!open) setPending(null);
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button
              negative
              onPress={() => {
                const next = pending;
                setPending(null);
                if (next !== null) go('config', next);
              }}
            >
              {t('config.discard')}
            </Button>
          </>
        )}
      >
        <p>{t('config.discardHelp')}</p>
      </ModalDialog>
    </div>
  );
}

function SourceCard({
  source,
  diagnostics,
  canValidate,
  canWrite,
  contentOffered,
  editor,
  groups,
  focusLine,
  onDirty
}: {
  source: ConfigSource;
  diagnostics: ConfigDiagnostic[];
  canValidate: boolean;
  canWrite: boolean;
  contentOffered: boolean;
  editor: ReturnType<typeof useConfigEditor>;
  groups: string[];
  focusLine: number | null;
  onDirty: (dirty: boolean) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const n = (value: number) => formatNumber(value, locale);
  // The draft keeps the digest of the text it started from: If-Match carries that, so a source that changed on
  // disk while it was being edited is refused with 412 instead of overwritten.
  const [draft, setDraft] = useState<{text: string; base: string} | null>(null);
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  // Content is only safe to edit when it is the complete accepted text: present and hashing to the accepted digest.
  const hash = useSha256(source.content);
  const complete = hash === undefined ? null : hash === source.content_sha256;
  const editing = draft !== null;
  // What the list shows: the last dry run, else the diagnostics a rejected save came back with, else the engine's.
  const saveErrors =
    editor.error instanceof ApiError && editor.error.status === 422 && editor.errorSource === source.id
      ? ((editor.error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics ?? [])
      : null;
  const shown = found ?? saveErrors ?? diagnostics;
  const marks = useMemo<EditorMark[]>(
    () => shown.filter(d => d.line !== null).map(d => ({line: d.line!, column: d.column, level: d.level, message: d.message})),
    [shown]
  );
  const text = draft?.text ?? source.content ?? '';
  // Names to complete after "->": the groups in the text being edited, else the running configuration's.
  const outbounds = () => {
    const own = groupNames(text);
    return own.length ? own : groups;
  };
  const [jump, setJump] = useState<number | null>(null);
  const dirty = editing && draft.text !== source.content;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // While editing, a quiet dry run follows the text: diagnostics update as the person types, without toasts.
  const api = getApi();
  const draftText = draft?.text;
  const sourceId = source.id;
  useEffect(() => {
    if (!canValidate || draftText === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.validateConfig({sources: [candidate({id: sourceId}, draftText)], mode: 'full'}, controller.signal).then(
        result => setFound(result.diagnostics),
        () => undefined
      );
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, canValidate, draftText, sourceId]);
  // `announce` also toasts a pass; a save reports only its own outcome.
  const validate = async (announce: 'always' | 'failure' = 'always') => {
    const result = await editor.validate({sources: [candidate(source, text)], mode: 'full'});
    if (!result) return false;
    setFound(result.diagnostics);
    // Put the cursor on the first error so the problem is on screen, not below a long file.
    const first = result.diagnostics.find(d => d.level === 'error' && d.line !== null);
    setJump(first ? first.line : null);
    if (!result.valid) toast('negative', t('config.invalid', {n: String(result.diagnostics.filter(d => d.level === 'error').length)}));
    else if (announce === 'always') toast('positive', t('config.valid'));
    return result.valid;
  };
  const save = async () => {
    if (draft === null) return;
    if (canValidate && !(await validate('failure'))) return;
    const result = await editor.save(source.id, draft.text, draft.base);
    // A rejected save carries its own diagnostics; drop the dry-run list so they show.
    setFound(null);
    if (result) {
      toast('positive', t('config.saved', {path: sourceName(source, t)}));
      setDraft(null);
    }
  };
  return (
    <section className="rp-card">
      <div className="rp-row">
        <span className="rp-cluster">
          <h3 className="rp-h3 rp-code">{sourceName(source, t)}</h3>
          {dirty && <Badge tone="warn">{t('config.unsaved')}</Badge>}
        </span>
        <span className="rp-cluster">
          {canValidate && (
            <Button isPending={editor.busy === 'validate'} isDisabled={!!editor.busy || source.content === undefined} onPress={() => void validate()}>
              {t('config.validate')}
            </Button>
          )}
          {canWrite && !editing && (
            <Button
              isDisabled={!complete || !!editor.busy}
              tip={complete === false ? t('config.incomplete') : undefined}
              onPress={() => setDraft({text: source.content ?? '', base: source.content_sha256})}
            >
              {t('config.edit')}
            </Button>
          )}
          {editing && (
            <>
              <Button
                isDisabled={!!editor.busy}
                onPress={() => {
                  setDraft(null);
                  setFound(null);
                }}
              >
                {t('ui.cancel')}
              </Button>
              <Button
                accent
                isPending={editor.busy === 'save'}
                isDisabled={!!editor.busy || !dirty}
                tip={t(navigator.platform.startsWith('Mac') ? 'config.saveShortcutMac' : 'config.saveShortcut')}
                onPress={() => void save()}
              >
                {t('config.save')}
              </Button>
            </>
          )}
        </span>
      </div>
      {shown.length > 0 && (
        <div className="rp-list" role="list" aria-label={t('config.diagnostics')}>
          {shown.map((item, index) => (
            <div className="rp-cluster" role="listitem" key={index}>
              <Light small tone={tones[item.level]}>
                {item.line !== null ? t('config.atLine', {line: n(item.line), message: item.message}) : item.message}
              </Light>
            </div>
          ))}
        </div>
      )}
      {source.content === undefined ? (
        // With content on, a withheld source is the one holding the API credential.
        <span className="rp-empty">{t(contentOffered ? 'config.contentCredential' : 'config.contentHidden')}</span>
      ) : (
        <CodeEditor
          label={sourceName(source, t)}
          value={text}
          readOnly={!editing || editor.busy === 'save'}
          onChange={editing ? value => setDraft(prev => (prev ? {...prev, text: value} : prev)) : undefined}
          marks={marks}
          focusLine={jump ?? focusLine}
          outbounds={outbounds}
          onSave={editing && dirty && !editor.busy ? () => void save() : undefined}
        />
      )}
      <span className="rp-label">{t(canWrite ? 'config.editNote' : 'config.readNote')}</span>
    </section>
  );
}

// Every diagnostic in one table: what the engine kept for the accepted configuration, or the last dry run
// over every source with text. A row opens its source at the line. Mirrors the archived validation page,
// minus the disk-versus-running diff the contract cannot describe.
function ValidateTab({
  config,
  editor,
  canValidate,
  open
}: {
  config: EffectiveConfig;
  editor: ReturnType<typeof useConfigEditor>;
  canValidate: boolean;
  open: (sourceId: string, line: number | null) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const n = (value: number) => formatNumber(value, locale);
  const [level, setLevel] = useState('all');
  const [run, setRun] = useState<ConfigValidationResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => (run?.diagnostics ?? config.diagnostics).map((item, index) => ({...item, id: String(index)})), [run, config.diagnostics]);
  const count = (which: ConfigDiagnostic['level']) => rows.filter(item => item.level === which).length;
  const errors = count('error');
  const warnings = count('warning');
  const shown = level === 'all' ? rows : rows.filter(item => item.level === level);
  const pathOf = (id: string) => {
    const source = config.sources.find(item => item.id === id);
    return source ? fileName(source) : id;
  };
  const cur = rows.find(item => item.id === selected) ?? null;
  // Only the text a person maintains is a candidate; subscription and generated sources are the engine's own.
  const candidates = config.sources.filter(item => item.content !== undefined && (item.kind === 'main' || item.kind === 'include'));
  return (
    <>
      <div className="rp-toolbar">
        <Light small tone={errors ? 'err' : warnings ? 'warn' : 'ok'}>
          {errors
            ? t('config.failed', {errors: t('config.errors', {n: errors}), warnings: t('config.warnings', {n: warnings})})
            : warnings
              ? t('config.passedWarnings', {n: n(warnings)})
              : t('config.passed')}
        </Light>
        <span className="rp-label">
          {run ? t('config.lastRun', {time: localTime(run.validated_at, locale)}) : t('config.acceptedDiagnostics', {generation: config.generation_id})}
        </span>
        <span className="rp-grow" />
        {canValidate && (
          <Button
            isPending={editor.busy === 'validate'}
            isDisabled={!!editor.busy || candidates.length === 0}
            tip={candidates.length === 0 ? t('config.contentHidden') : undefined}
            onPress={() => {
              void editor.validate({sources: candidates.map(item => candidate(item, item.content!)), mode: 'full'}).then(result => {
                // A fresh list has new rows; the old selection would point at a different diagnostic.
                if (result) {
                  setRun(result);
                  setSelected(null);
                }
              });
            }}
          >
            <Refresh />
            {t('config.revalidate')}
          </Button>
        )}
      </div>
      <span className="rp-label">{t('config.validateNote')}</span>
      <Segmented
        label={t('config.level')}
        value={level}
        onChange={setLevel}
        items={[
          ['all', t('config.levelAll', {n: n(rows.length)})],
          ['error', t('config.levelErrors', {n: n(errors)})],
          ['warning', t('config.levelWarnings', {n: n(warnings)})],
          ['info', t('config.levelInfo', {n: n(count('info'))})]
        ]}
      />
      <DataTable
        label={t('config.diagnostics')}
        rows={shown}
        height={360}
        selected={selected}
        onSelect={setSelected}
        empty={t('config.noDiagnostics')}
        cols={[
          {id: 'level', label: t('config.level'), minWidth: 96, grow: 0},
          {id: 'where', label: t('config.where'), minWidth: 150, grow: 0},
          {id: 'message', label: t('config.message'), minWidth: 240, grow: 2, isRowHeader: true},
          {id: 'code', label: t('config.code'), minWidth: 140, drop: 1}
        ]}
        render={item => [
          <Light small tone={tones[item.level]}>
            {t(levels[item.level])}
          </Light>,
          <span className="rp-code">{item.line !== null ? `${pathOf(item.source_id)}:${item.line}` : pathOf(item.source_id)}</span>,
          <TextTooltip>{item.message}</TextTooltip>,
          <span className="rp-code">{item.code}</span>
        ]}
      />
      {cur && (
        <div className="rp-cluster">
          <Light small tone={tones[cur.level]}>
            {cur.line !== null ? t('config.atFile', {file: pathOf(cur.source_id), line: n(cur.line), message: cur.message}) : cur.message}
          </Light>
          <Button onPress={() => open(cur.source_id, cur.line)}>{t('config.openSource')}</Button>
        </div>
      )}
    </>
  );
}
