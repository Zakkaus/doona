import {useEffect, useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {getApi} from '../../api';
import {useCapabilities, useConfig, useConfigEditor} from '../../api/store';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {ApiError} from '../../api/error';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {Badge, Button, DataTable, ErrorMessage, Kv, LabeledSelect, Light, ModalDialog, Segmented, Tabs, TextTooltip, errorText, toast} from '../../ui/ui';
import type {ConfigValidationResult} from '../../api/model';
import Refresh from '../../ui/icons/Refresh';
import {CodeEditor, type EditorMark} from '../../ui/code/CodeEditor';
import {groupNames} from './names';
import type {PageProps} from '../types';

const kinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};

// A query change that keeps the other parameters.
function within(query: string, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(query);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next.toString();
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
// The digest of a text, once computed; undefined until then or when there is no text.
function useSha256(text: string | undefined): string | undefined {
  const [hashes, setHashes] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (text === undefined || hashes.has(text)) return;
    let live = true;
    void sha256(text).then(hash => live && setHashes(prev => new Map(prev).set(text, hash)));
    return () => {
      live = false;
    };
  }, [text, hashes]);
  return text === undefined ? undefined : hashes.get(text);
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
  const tab = params.get('tab') === 'validate' ? 'validate' : 'source';
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
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
  const groupList = useMemo(() => groupNames(sources.find(item => item.kind === 'main')?.content ?? ''), [sources]);
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
  if (resources && !resources.config.available)
    return (
      <div className="rp-page">
        <span className="rp-empty">{t('config.unavailable')}</span>
      </div>
    );
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
            {
              id: 'source',
              label: t('config.tabSource'),
              content: (
                <>
                  {config.data && (
                    <div className="rp-toolbar">
                      <LabeledSelect
                        side
                        label={t('config.source')}
                        value={selectedId ?? ''}
                        onChange={select}
                        items={sources.map(item => ({id: item.id, label: item.path, desc: t(kinds[item.kind])}))}
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
                    </div>
                  )}
                  {source && config.data && (
                    <SourceCard
                      key={source.id}
                      source={source}
                      diagnostics={config.data.diagnostics.filter(d => d.source_id === source.id)}
                      canValidate={resources?.config_validate.available === true && (resources.config_validate.modes ?? []).includes('full')}
                      canWrite={resources?.config.writable === true && source.writable}
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
                  canValidate={resources?.config_validate.available === true && (resources.config_validate.modes ?? []).includes('full')}
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
  editor,
  groups,
  focusLine,
  onDirty
}: {
  source: ConfigSource;
  diagnostics: ConfigDiagnostic[];
  canValidate: boolean;
  canWrite: boolean;
  editor: ReturnType<typeof useConfigEditor>;
  groups: string[];
  focusLine: number | null;
  onDirty: (dirty: boolean) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const n = (value: number) => formatNumber(value, locale);
  const [draft, setDraft] = useState<string | null>(null);
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  // Content is only safe to edit when it is the complete accepted text: present and hashing to the accepted digest.
  const hash = useSha256(source.content);
  const complete = hash === undefined ? null : hash === source.content_sha256;
  const editing = draft !== null;
  // What the list shows: the last dry run, else the diagnostics a rejected save came back with, else the engine's.
  const saveErrors =
    editor.error instanceof ApiError && editor.error.status === 422
      ? ((editor.error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics ?? [])
      : null;
  const shown = found ?? saveErrors ?? diagnostics;
  const marks = useMemo<EditorMark[]>(
    () => shown.filter(d => d.line !== null).map(d => ({line: d.line!, column: d.column, level: d.level, message: d.message})),
    [shown]
  );
  // Names to complete after "->": the groups in the text being edited, else the running configuration's.
  const outbounds = () => {
    const own = groupNames(text);
    return own.length ? own : groups;
  };
  const text = draft ?? source.content ?? '';
  const [jump, setJump] = useState<number | null>(null);
  const dirty = editing && draft !== source.content;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  // While editing, a quiet dry run follows the text: diagnostics update as the person types, without toasts.
  const api = getApi();
  useEffect(() => {
    if (!editing || !canValidate || draft === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.validateConfig({sources: [{id: source.id, path: source.path, content: draft}], mode: 'full'}, controller.signal).then(
        result => setFound(result.diagnostics),
        () => undefined
      );
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, editing, canValidate, draft, source.id, source.path]);
  const validate = async () => {
    const result = await editor.validate({sources: [{id: source.id, path: source.path, content: text}], mode: 'full'});
    if (!result) return false;
    setFound(result.diagnostics);
    // Put the cursor on the first error so the problem is on screen, not below a long file.
    const first = result.diagnostics.find(d => d.level === 'error' && d.line !== null);
    setJump(first ? first.line : null);
    toast(
      result.valid ? 'positive' : 'negative',
      t(result.valid ? 'config.valid' : 'config.invalid', {n: String(result.diagnostics.filter(d => d.level === 'error').length)})
    );
    return result.valid;
  };
  const save = async () => {
    if (draft === null) return;
    if (canValidate && !(await validate())) return;
    const result = await editor.save(source.id, draft, source.content_sha256);
    // A rejected save carries its own diagnostics; drop the dry-run list so they show.
    setFound(null);
    if (result) {
      toast('positive', t('config.saved', {path: source.path}));
      setDraft(null);
    }
  };
  return (
    <section className="rp-card">
      <div className="rp-row">
        <span className="rp-cluster">
          <h3 className="rp-h3 rp-code">{source.path}</h3>
          {editing && draft !== source.content && <Badge tone="warn">{t('config.unsaved')}</Badge>}
        </span>
        <span className="rp-cluster">
          {canValidate && (
            <Button small isPending={editor.busy === 'validate'} isDisabled={!!editor.busy || source.content === undefined} onPress={() => void validate()}>
              {t('config.validate')}
            </Button>
          )}
          {canWrite && !editing && (
            <Button
              small
              isDisabled={!complete || !!editor.busy}
              tip={complete === false ? t('config.incomplete') : undefined}
              onPress={() => setDraft(source.content ?? '')}
            >
              {t('config.edit')}
            </Button>
          )}
          {editing && (
            <>
              <Button
                small
                isDisabled={!!editor.busy}
                onPress={() => {
                  setDraft(null);
                  setFound(null);
                }}
              >
                {t('ui.cancel')}
              </Button>
              <Button
                small
                accent
                isPending={editor.busy === 'save'}
                isDisabled={!!editor.busy || draft === source.content}
                tip={t('config.saveShortcut')}
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
                {t(levels[item.level])}
              </Light>
              <span className="rp-code">{item.line !== null ? t('config.lineRef', {line: n(item.line)}) : '—'}</span>
              <span>{item.message}</span>
              <span className="rp-label">{item.code}</span>
            </div>
          ))}
        </div>
      )}
      {source.content === undefined ? (
        <span className="rp-empty">{t('config.contentHidden')}</span>
      ) : (
        <CodeEditor
          label={source.path}
          value={text}
          readOnly={!editing || editor.busy === 'save'}
          onChange={editing ? setDraft : undefined}
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
  config: {sources: ConfigSource[]; diagnostics: ConfigDiagnostic[]; generation_id: string};
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
  const pathOf = (id: string) =>
    config.sources
      .find(item => item.id === id)
      ?.path.split('/')
      .pop() ?? id;
  const cur = rows.find(item => item.id === selected) ?? null;
  // Only the text a person maintains is a candidate; subscription and generated sources are the engine's own.
  const candidates = config.sources.filter(item => item.content !== undefined && (item.kind === 'main' || item.kind === 'include'));
  return (
    <>
      <div className="rp-toolbar">
        <Light small tone={errors ? 'err' : warnings ? 'warn' : 'ok'}>
          {errors
            ? t('config.failed', {errors: n(errors), warnings: n(warnings)})
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
            small
            isPending={editor.busy === 'validate'}
            isDisabled={!!editor.busy || candidates.length === 0}
            tip={candidates.length === 0 ? t('config.contentHidden') : undefined}
            onPress={() => {
              void editor.validate({sources: candidates.map(item => ({id: item.id, path: item.path, content: item.content!})), mode: 'full'}).then(result => {
                if (result) setRun(result);
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
          {id: 'level', label: t('config.levelLabel'), minWidth: 96, grow: 0},
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
            {t(levels[cur.level])}
          </Light>
          <span className="rp-code">
            {cur.line !== null ? `${pathOf(cur.source_id)}:${cur.line}${cur.column !== null ? ':' + cur.column : ''}` : pathOf(cur.source_id)}
          </span>
          <span>{cur.message}</span>
          <Button small onPress={() => open(cur.source_id, cur.line)}>
            {t('config.openSource')}
          </Button>
        </div>
      )}
    </>
  );
}
