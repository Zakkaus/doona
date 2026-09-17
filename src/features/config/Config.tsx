import {useEffect, useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useConfig, useConfigEditor} from '../../api/store';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {ApiError} from '../../api/error';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {Badge, Button, DataTable, ErrorMessage, Kv, Light, SourceView, TextArea, TextTooltip, errorText, toast} from '../../ui/ui';
import type {PageProps} from '../types';

const kinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
const tones = {error: 'err', warning: 'warn', info: 'info'} as const;
const levels: Record<ConfigDiagnostic['level'], Key> = {error: 'config.level.error', warning: 'config.level.warning', info: 'config.level.info'};

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
  const sources = config.data?.sources ?? [];
  const selectedId = params.get('source') ?? sources[0]?.id ?? null;
  const source = sources.find(item => item.id === selectedId) ?? null;
  const select = (id: string | null) => {
    const next = new URLSearchParams(query);
    if (id) next.set('source', id);
    else next.delete('source');
    go('config', next.toString());
  };
  const n = (value: number) => formatNumber(value, locale);
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
      <DataTable
        label={t('nav.config')}
        loading={config.loading && !config.data}
        rows={sources}
        height={300}
        selected={selectedId}
        onSelect={id => id && select(id)}
        selectOnFocus
        empty={t('config.noSources')}
        cols={[
          {id: 'path', label: t('config.path'), minWidth: 240, grow: 2, isRowHeader: true},
          {id: 'kind', label: t('config.kindLabel'), minWidth: 110, grow: 0},
          {id: 'bytes', label: t('config.size'), minWidth: 90, grow: 0, align: 'end', drop: 2},
          {id: 'lines', label: t('config.lines'), minWidth: 80, grow: 0, align: 'end', drop: 3},
          {id: 'loaded', label: t('config.loaded'), minWidth: 160, drop: 1},
          {id: 'writable', label: t('config.writable'), minWidth: 100, grow: 0, drop: 4}
        ]}
        render={row => [
          <TextTooltip className="rp-code">{row.path}</TextTooltip>,
          <Badge>{t(kinds[row.kind])}</Badge>,
          formatBytes(String(row.bytes)),
          n(row.line_count),
          localTime(row.loaded_at, locale),
          <Light small tone={row.writable ? 'ok' : 'muted'}>
            {t(row.writable ? 'config.editable' : 'config.readOnly')}
          </Light>
        ]}
      />
      {source && config.data && (
        <SourceCard
          key={source.id}
          source={source}
          diagnostics={config.data.diagnostics.filter(d => d.source_id === source.id)}
          canValidate={resources?.config_validate.available === true && (resources.config_validate.modes ?? []).includes('full')}
          canWrite={resources?.config.writable === true && source.writable}
          editor={editor}
        />
      )}
    </div>
  );
}

function SourceCard({
  source,
  diagnostics,
  canValidate,
  canWrite,
  editor
}: {
  source: ConfigSource;
  diagnostics: ConfigDiagnostic[];
  canValidate: boolean;
  canWrite: boolean;
  editor: ReturnType<typeof useConfigEditor>;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
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
  const marks = useMemo(() => new Map(shown.filter(d => d.line !== null).map(d => [d.line!, d.level])), [shown]);
  const text = draft ?? source.content ?? '';
  const validate = async () => {
    const result = await editor.validate({sources: [{id: source.id, path: source.path, content: text}], mode: 'full'});
    if (!result) return false;
    setFound(result.diagnostics);
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
          <Badge>{t(kinds[source.kind])}</Badge>
          <span className="rp-label">{t('config.loadedAt', {time: localTime(source.loaded_at, locale)})}</span>
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
              <Button small accent isPending={editor.busy === 'save'} isDisabled={!!editor.busy || draft === source.content} onPress={() => void save()}>
                {t('config.save')}
              </Button>
            </>
          )}
        </span>
      </div>
      {source.content === undefined ? (
        <span className="rp-empty">{t('config.contentHidden')}</span>
      ) : editing ? (
        <TextArea label={source.path} value={draft} onChange={setDraft} isDisabled={editor.busy === 'save'} />
      ) : (
        <SourceView label={source.path} text={source.content} marks={marks} />
      )}
      {shown.length > 0 && (
        <div className="rp-list" role="list" aria-label={t('config.diagnostics')}>
          {shown.map((item, index) => (
            <div className="rp-cluster" role="listitem" key={index}>
              <Light small tone={tones[item.level]}>
                {t(levels[item.level])}
              </Light>
              <span className="rp-code">{item.line !== null ? `${item.line}:${item.column ?? 1}` : '—'}</span>
              <span>{item.message}</span>
              <span className="rp-label">{item.code}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
