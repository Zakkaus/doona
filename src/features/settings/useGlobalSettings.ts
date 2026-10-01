import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useVersion} from '../../store';
import {useCompleteness} from '../../store/config';
import {ApiError} from '../../api/error';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {blockFields, scanConfig} from '../../dae/text';
import {serializeSetting, settingValue, writeSettings} from '../../dae/settings';
import {fileName, restartRequired, validationSources} from '../../dae/sources';
import {useDraftGuard} from '../../shell/draft';
import {within} from '../../shell/route';
import type {PageProps} from '../../shell/routes';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';

export function useGlobalSettings({query, go}: PageProps) {
  const t = useT();
  const caps = useCapabilities().data?.resources;
  const available = offered(caps, 'config', {whileLoading: false});
  const config = useConfig(available);
  const version = useVersion().data;
  const engine = engineOf(version);
  const schema = engine.globalSettings;
  const sources = useMemo(() => config.data?.sources ?? [], [config.data?.sources]);
  const complete = useCompleteness(sources);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const choices = sources
    .filter(source => source.kind === 'main' || source.kind === 'include')
    .flatMap(source => {
      const blocks = scanConfig(source.content).blocks.filter(block => block.name === schema?.name);
      return (blocks.length ? blocks : source.kind === 'main' ? [null] : []).map((block, index) => ({
        id: `${source.id}:${index}`,
        source,
        block,
        index,
        label: `${fileName(source)}:${block ? block.line + 1 : 1}`
      }));
    });
  const chosen = choices.find(choice => choice.source.id === params.get('source') && choice.index === Number(params.get('section') ?? 0)) ?? choices[0];
  const source = chosen?.source;
  const editor = useConfigEditor(config.refetch);
  const [draft, setDraft] = useState<{source: ConfigSource; id: string; patch: Record<string, string>} | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const guard = useDraftGuard(!!draft, () => {
    setDraft(null);
    setFailure(null);
  });
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  const patch = draft?.patch ?? {};
  const text = draft?.source.content ?? source?.content ?? '';
  const parsed = scanConfig(text);
  const block = parsed.blocks.filter(block => block.name === schema?.name)[chosen?.index ?? 0];
  const stored = block ? blockFields(text, block, parsed.tokens) : [];
  const fields = (schema?.fields ?? []).map(definition => {
    const matches = stored.filter(field => field.name === definition.key);
    const value = patch[definition.key] ?? (matches[0] ? settingValue(definition, matches[0].value) : '');
    return {
      ...definition,
      value,
      duplicate: matches.length > 1,
      invalid: serializeSetting(definition, value) === null,
      change: (value: string) => {
        if (!source || editor.busy) return;
        editor.cancel();
        setFailure(null);
        const next = {...patch, [definition.key]: value};
        if (value === (matches[0] ? settingValue(definition, matches[0].value) : '')) delete next[definition.key];
        setDraft(Object.keys(next).length ? {source: draft?.source ?? source, id: chosen.id, patch: next} : null);
      }
    };
  });
  const conflict = !!draft && (draft.source.content_sha256 !== source?.content_sha256 || draft.id !== chosen?.id);
  const writable =
    available &&
    !config.error &&
    !!source &&
    caps?.config.writable === true &&
    source.writable &&
    complete(source) === true &&
    !engine.holdsCredentials(source);
  const busy = !!editor.busy;
  const blocked = !draft || !writable || conflict || fields.some(field => field.invalid);
  const invalid = (diagnostics: ConfigDiagnostic[]) => {
    const restart = restartRequired(diagnostics);
    return restart ? t('config.writeRestart', {n: restart}) : t('config.invalid', {n: diagnostics.filter(item => item.level === 'error').length});
  };
  const rejected =
    editor.error instanceof ApiError && editor.error.status === 422 ? (editor.error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics : null;
  const save = async () => {
    if (blocked || busy || !schema || !chosen) return;
    const content = writeSettings(draft.source.content, schema, chosen.index, patch);
    const candidates = validationSources(
      sources.filter(source => complete(source)),
      {id: source.id, content}
    );
    if (caps?.config_validate.available && caps.config_validate.modes?.includes('full')) {
      if (!candidates) {
        setFailure(t('config.incomplete'));
        return;
      }
      const result = await editor.validate({sources: candidates, mode: 'full'});
      if (!result) return;
      if (!result.valid) {
        setFailure(invalid(result.diagnostics));
        return;
      }
    }
    const result = await editor.apply(draft.source, content);
    if (!result) return;
    if (result.diagnostics) {
      setFailure(invalid(result.diagnostics));
      return;
    }
    guard.clear();
    setDraft(null);
    toast('positive', t('settings.globalSaved'));
  };
  useEffect(() => {
    if (params.get('card') !== 'global') return;
    const field = params.get('field');
    const root = document.getElementById('settings-global-form');
    const element = field
      ? root?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(field)}"] input, [data-setting="${CSS.escape(field)}"] button`)
      : document.getElementById('settings-global');
    element?.focus();
    element?.scrollIntoView({block: 'center'});
  }, [params, source?.id, schema, writable]);
  return {
    available: available && !!schema,
    fields,
    source,
    busy,
    blocked,
    writable,
    dirty: !!draft,
    conflict,
    failure: failure ?? (rejected ? invalid(rejected) : null),
    error: (rejected ? null : editor.error) ?? config.error,
    retry: config.refetch,
    save,
    cancel: () => {
      editor.cancel();
      guard.clear();
      setDraft(null);
      setFailure(null);
    },
    choices: choices.map(({id, label}) => ({id, label})),
    selected: chosen?.id ?? '',
    select: (id: string) => {
      const choice = choices.find(choice => choice.id === id);
      if (choice) go('settings', within(query, {card: 'global', source: choice.source.id, section: String(choice.index), field: null}));
    }
  };
}
