import {useState} from 'react';
import {enumLabel} from '../../i18n/enum';
import {useCapabilities, useRuntimeSettings} from '../../store';
import type {RuntimeSettingField, RuntimeSettings, RuntimeSettingsPatch} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {toast} from '../../ui/ui';
import {
  numericFields,
  numericAccess,
  numericFieldView,
  recorderFields,
  recorderAccess,
  recorderPatchValue,
  recorderView,
  recordingNote,
  runtimeApplyReason,
  flowRecordingNote,
  type Numeric,
  type Recorder,
  type RecorderChoice
} from './view';
import {useDraftGuard} from '../../shell/draft';
import {logLevelLabels} from '../../api/selectors';
import {errorText} from '../../api/error';

export function useRuntimeSettingsForm() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const caps = useCapabilities();
  const capabilities = caps.data?.resources;
  const available = capabilities?.runtime_settings.available ?? false;
  const fields = new Set<RuntimeSettingField>(capabilities?.runtime_settings.fields ?? []);
  const settings = useRuntimeSettings(available);
  const baseline = settings.data;
  const modeOf = (id: Recorder): RecorderChoice => baseline?.recording?.[recorderAccess[id].state]?.mode ?? 'auto';
  const stamp = baseline ? JSON.stringify([baseline.log, baseline.dns_log, baseline.flows, recorderFields.map(modeOf)]) : '';
  const [draft, setDraft] = useState<{
    at: string;
    level?: string;
    values: Partial<Record<Numeric, string>>;
    modes: Partial<Record<Recorder, RecorderChoice>>;
  } | null>(null);
  const edits = draft ?? {at: stamp, values: {}, modes: {}};
  const level = edits.level ?? baseline?.log?.level ?? '';
  const dirty = !!draft && (draft.level !== undefined || Object.keys(draft.values).length > 0 || Object.keys(draft.modes).length > 0);
  const guard = useDraftGuard(dirty, () => setDraft(null));
  const ceilings: Record<Numeric, number | undefined> = {
    'log.buffered_records': capabilities?.logs.max_buffered_records,
    'dns_log.max_records': capabilities?.dns_log.max_records,
    'flows.max_flows': capabilities?.flows.max_flows,
    'flows.retention_seconds': capabilities?.flows.retention_seconds
  };
  // An absent minimum means 1.
  const floors: Record<Numeric, number> = {
    'log.buffered_records': capabilities?.logs.min_buffered_records ?? 1,
    'dns_log.max_records': capabilities?.dns_log.min_records ?? 1,
    'flows.max_flows': capabilities?.flows.min_flows ?? 1,
    'flows.retention_seconds': 1
  };
  // A control whose section or member the engine omits stays hidden.
  const hasLevel = fields.has('log.level') && (!baseline || baseline.log?.level !== undefined);
  const numeric = numericFields
    .filter(id => fields.has(id) && (!baseline || numericAccess[id].read(baseline) !== undefined))
    .map(id => ({
      ...numericFieldView(id, edits.values[id] ?? String((baseline && numericAccess[id].read(baseline)) ?? ''), floors[id], ceilings[id], locale, t),
      change: (value: string) => {
        if (!settings.busy) setDraft({...edits, values: {...edits.values, [id]: value.trim()}});
      }
    }));
  const recorders = recorderFields
    .filter(id => fields.has(id) && (!baseline || baseline.recording?.[recorderAccess[id].state] !== undefined))
    .map(id => ({
      ...recorderView(id, edits.modes[id] ?? modeOf(id), baseline?.recording?.[recorderAccess[id].state], t),
      change: (value: string) => {
        if (!settings.busy) setDraft({...edits, modes: {...edits.modes, [id]: value as RecorderChoice}});
      }
    }));
  const patch: RuntimeSettingsPatch = {};
  if (baseline) {
    for (const recorder of recorders) if (recorder.value !== modeOf(recorder.id)) patch[recorder.id] = recorderPatchValue(recorder.value);
    if (hasLevel && level !== baseline.log?.level) patch.log = {level: level as NonNullable<RuntimeSettings['log']>['level']};
    for (const field of numeric)
      if (!field.invalid && Number(field.value) !== numericAccess[field.id].read(baseline)) numericAccess[field.id].write(patch, Number(field.value));
  }
  const apply = () => {
    if (settings.busy) return;
    const submitted = draft;
    void settings.save(patch).then(
      result => {
        if (result === undefined) return;
        setDraft(current => (current === submitted ? null : current));
        toast('positive', t('settings.runtimeSaved'));
      },
      (error: unknown) => toast('negative', t('settings.runtimeFailed'), {detail: errorText(error, t)})
    );
  };
  return {
    numeric,
    recorders,
    recordingNote: recordingNote(baseline?.recording, t),
    flowNote: fields.has('record_flows') ? flowRecordingNote(edits.modes.record_flows ?? modeOf('record_flows'), t) : null,
    level,
    setLevel: (value: string) => {
      if (!settings.busy) setDraft({...edits, level: value});
    },
    levels: (capabilities?.logs.levels ?? (['trace', 'debug', 'info', 'warn', 'error'] as const)).map(id => ({id, label: enumLabel(logLevelLabels, id, t)})),
    hasLevel,
    hasBaseline: !!baseline,
    source: baseline ? t(baseline.source === 'runtime' ? 'settings.sourceRuntime' : 'settings.sourceConfig') : null,
    sourceTone: baseline?.source === 'runtime' ? ('info' as const) : ('neutral' as const),
    capsError: caps.error,
    retryCaps: caps.refetch,
    waiting: !capabilities,
    available,
    note: t(available ? 'settings.runtimeNote' : 'settings.runtimeUnavailable'),
    error: settings.error,
    retry: settings.refetch,
    loading: settings.loading && !baseline,
    busy: settings.busy,
    conflict: dirty && draft.at !== stamp ? t('settings.runtimeConflict') : null,
    discard: () => {
      guard.clear();
      setDraft(null);
    },
    dirty,
    blocked: !Object.keys(patch).length || numeric.some(field => field.invalid),
    reason: runtimeApplyReason({busy: settings.busy, invalid: numeric.find(field => field.invalid)?.label ?? null}, t),
    apply
  };
}
