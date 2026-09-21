import {useState} from 'react';
import {useCapabilities, useRuntimeSettings} from '../../api/store';
import type {RuntimeSettingField, RuntimeSettings, RuntimeSettingsPatch} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {toast, errorText} from '../../ui/ui';
import {numericFields, numericAccess, numericFieldView, type Numeric} from './view';

export function useRuntimeSettingsForm() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const caps = useCapabilities();
  const capabilities = caps.data?.resources;
  const available = capabilities?.runtime_settings.available ?? false;
  const fields = new Set<RuntimeSettingField>(capabilities?.runtime_settings.fields ?? []);
  const settings = useRuntimeSettings(available);
  const baseline = settings.data;
  const stamp = baseline ? JSON.stringify([baseline.log, baseline.dns_log, baseline.flows]) : '';
  const [draft, setDraft] = useState<{at: string; level?: string; values: Partial<Record<Numeric, string>>}>({at: '', values: {}});
  const edits = baseline && draft.at === stamp ? draft : {at: stamp, values: {}};
  const level = edits.level ?? baseline?.log.level ?? '';
  const ceilings: Record<Numeric, number | undefined> = {
    'log.buffered_records': capabilities?.logs.max_buffered_records,
    'dns_log.max_records': capabilities?.dns_log.max_records,
    'flows.max_flows': capabilities?.flows.max_flows,
    'flows.retention_seconds': capabilities?.flows.retention_seconds
  };
  const numeric = numericFields
    .filter(id => fields.has(id))
    .map(id => ({
      ...numericFieldView(id, edits.values[id] ?? (baseline ? String(numericAccess[id].read(baseline)) : ''), ceilings[id], locale, t),
      change: (value: string) => setDraft({...edits, values: {...edits.values, [id]: value.trim()}})
    }));
  const patch: RuntimeSettingsPatch = {};
  if (baseline) {
    if (fields.has('log.level') && level !== baseline.log.level) patch.log = {level: level as RuntimeSettings['log']['level']};
    for (const field of numeric)
      if (!field.invalid && Number(field.value) !== numericAccess[field.id].read(baseline)) numericAccess[field.id].write(patch, Number(field.value));
  }
  const apply = () => {
    void settings.save(patch).then(
      () => toast('positive', t('settings.runtimeSaved')),
      (error: unknown) => toast('negative', errorText(error))
    );
  };
  return {
    numeric,
    level,
    setLevel: (value: string) => setDraft({...edits, level: value}),
    levels: (capabilities?.logs.levels ?? ['trace', 'debug', 'info', 'warn', 'error']).map(id => ({id, label: id})),
    hasLevel: fields.has('log.level'),
    hasBaseline: !!baseline,
    source: baseline ? t(baseline.source === 'runtime' ? 'settings.sourceRuntime' : 'settings.sourceConfig') : null,
    sourceTone: baseline?.source === 'runtime' ? ('info' as const) : ('neutral' as const),
    capsError: caps.error,
    waiting: !capabilities,
    available,
    note: t(available ? 'settings.runtimeNote' : 'settings.runtimeUnavailable'),
    error: settings.error,
    loading: settings.loading && !baseline,
    busy: settings.busy,
    blocked: !Object.keys(patch).length || numeric.some(field => field.invalid),
    apply
  };
}
