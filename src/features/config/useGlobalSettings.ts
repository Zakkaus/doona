import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useVersion} from '../../store';
import {useCompleteness} from '../../store/config';
import {refusalDetails} from '../shared/pending';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {blockFields, scanConfig} from '../../dae/text';
import {serializeSetting, settingGroups, settingValue, writeSettings, type SettingField} from '../../dae/settings';
import {fileName, restartSettings, validationSources} from '../../dae/sources';
import {useDraftGuard} from '../../shell/draft';
import {within} from '../../shell/route';
import type {PageProps} from '../../shell/routes';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';

// The widest integer a field takes; a hint naming it would only say the value is a whole number.
const u64 = '18446744073709551615';

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
  // A message, or the diagnostics that refused the write.
  const [failure, setFailure] = useState<string | ConfigDiagnostic[] | null>(null);
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
  const separator = t('ui.listSeparator');
  const hint = (field: SettingField) =>
    field.type === 'list'
      ? t('config.globalList')
      : field.choices && field.type === 'integer'
        ? t('config.globalChoice', {choices: field.choices.join(separator)})
        : field.max && field.max !== u64
          ? t('config.globalRange', {max: field.max})
          : field.units
            ? t('config.globalUnits', {units: field.units.filter(Boolean).join(separator)})
            : undefined;
  const fields = (schema?.fields ?? []).map(definition => {
    const matches = stored.filter(field => field.name === definition.key);
    const value = patch[definition.key] ?? (matches[0] ? settingValue(definition, matches[0].value) : '');
    const picked = definition.type === 'boolean' || (!!definition.choices && definition.type !== 'integer');
    const options = definition.type === 'boolean' ? ['true', 'false'] : (definition.choices ?? []);
    return {
      key: definition.key,
      group: definition.group,
      label: t(definition.label),
      hint: hint(definition),
      // A picker lists the accepted values, plus a stored value outside them so it still shows as it is.
      items: picked
        ? [
            {id: '', label: t('config.globalUnset')},
            ...[...options, ...(value && !options.includes(value) ? [value] : [])].map(item => ({id: item, label: item}))
          ]
        : null,
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
  const blocked = !draft || !writable || conflict || fields.some(field => field.key in patch && field.invalid);
  const rejected = refusalDetails(editor.error)?.diagnostics ?? null;
  const refusal = failure ?? rejected ?? null;
  // Shown while the draft that was refused is still open, as the source editor shows it.
  const restart = draft && Array.isArray(refusal) ? restartSettings(refusal) : [];
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
        setFailure(result.diagnostics);
        return;
      }
    }
    const result = await editor.apply(draft.source, content);
    if (!result) return;
    if (result.diagnostics) {
      setFailure(result.diagnostics);
      return;
    }
    guard.clear();
    setDraft(null);
    toast('positive', t('config.globalSaved'));
  };
  useEffect(() => {
    const field = params.get('field');
    if (params.get('tab') !== 'global' || !field) return;
    const element = document
      .getElementById('config-global-form')
      ?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(field)}"] input, [data-setting="${CSS.escape(field)}"] button`);
    element?.focus();
    element?.scrollIntoView({block: 'center'});
  }, [params, source?.id, schema, writable]);
  return {
    available: available && !!schema,
    fields,
    groups: Object.entries(settingGroups)
      .map(([id, title]) => ({id, title: t(title), fields: fields.filter(field => field.group === id)}))
      .filter(group => group.fields.length > 0),
    source,
    busy,
    blocked,
    writable,
    dirty: !!draft,
    conflict,
    failure: Array.isArray(refusal) ? (restart.length ? null : t('config.invalid', {n: refusal.filter(item => item.level === 'error').length})) : refusal,
    restart,
    sources,
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
      if (choice) go('config', within(query, {tab: 'global', source: choice.source.id, section: String(choice.index), field: null}));
    }
  };
}
