import type {RecorderMode, RecorderState, RuntimeSettingField, RuntimeSettings, RuntimeSettingsPatch, GeoData} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {localTime, relativeStart} from '../../api/selectors';
import {formatNumber, type Params, type Translator} from '../../i18n';
import type {Key} from '../../i18n/messages';

export type Recorder = Extract<RuntimeSettingField, 'record_flows' | 'record_logs' | 'record_dns_log'>;
export type Numeric = Exclude<RuntimeSettingField, 'log.level' | Recorder>;
export type RecorderChoice = 'auto' | 'on' | 'off';
export const recorderFields: Recorder[] = ['record_flows', 'record_logs', 'record_dns_log'];
export const recorderAccess: Record<Recorder, {state: 'flows' | 'logs' | 'dns_log'; label: Key}> = {
  record_flows: {state: 'flows', label: 'settings.recordFlows'},
  record_logs: {state: 'logs', label: 'settings.recordLogs'},
  record_dns_log: {state: 'dns_log', label: 'settings.recordDnsLog'}
};
const recorderChoiceLabel: Record<RecorderChoice, Key> = {auto: 'settings.record.auto', on: 'settings.record.on', off: 'settings.record.off'};
// The wire form: booleans pin a recorder, the string follows attachment.
export const recorderPatchValue = (choice: RecorderChoice): RecorderMode => (choice === 'auto' ? 'auto' : choice === 'on');
export function recorderView(id: Recorder, choice: RecorderChoice, state: RecorderState | undefined, t: Translator) {
  const forbidden = state ? !state.allowed : false;
  return {
    id,
    label: t(recorderAccess[id].label),
    value: choice,
    items: (['auto', 'on', 'off'] as const).map(mode => ({id: mode, label: t(recorderChoiceLabel[mode])})),
    disabled: forbidden,
    tone: forbidden ? ('muted' as const) : state?.active ? ('ok' as const) : ('neutral' as const),
    status: t(forbidden ? 'settings.recordingForbidden' : state?.active ? 'settings.recordingActive' : 'settings.recordingIdle')
  };
}
export function recordingNote(recording: RuntimeSettings['recording'] | undefined, t: Translator) {
  if (!recording) return null;
  if (recording.grace_remaining_seconds > 0) return t('settings.recordingGrace', {n: recording.grace_remaining_seconds});
  return t(recording.events.active ? 'settings.recordingEvents' : 'settings.recordingDetached');
}
export const numericFields: Numeric[] = ['log.buffered_records', 'dns_log.max_records', 'flows.max_flows', 'flows.retention_seconds'];
export const numericAccess: Record<
  Numeric,
  {read: (value: RuntimeSettings) => number; write: (patch: RuntimeSettingsPatch, value: number) => void; floor: number; label: Key}
> = {
  'log.buffered_records': {
    read: s => s.log.buffered_records,
    write: (p, v) => {
      (p.log ??= {}).buffered_records = v;
    },
    floor: 64,
    label: 'settings.logBuffer'
  },
  'dns_log.max_records': {
    read: s => s.dns_log.max_records,
    write: (p, v) => {
      (p.dns_log ??= {}).max_records = v;
    },
    floor: 64,
    label: 'settings.dnsLogSize'
  },
  'flows.max_flows': {
    read: s => s.flows.max_flows,
    write: (p, v) => {
      (p.flows ??= {}).max_flows = v;
    },
    floor: 64,
    label: 'settings.flowsMax'
  },
  'flows.retention_seconds': {
    read: s => s.flows.retention_seconds,
    write: (p, v) => {
      (p.flows ??= {}).retention_seconds = v;
    },
    floor: 1,
    label: 'settings.flowsRetention'
  }
};
export function numericFieldView(id: Numeric, value: string, ceiling: number | undefined, locale: string, t: Translator) {
  const access = numericAccess[id];
  return {
    id,
    value,
    label: t(access.label),
    invalid: !/^\d+$/.test(value) || Number(value) < access.floor || (ceiling !== undefined && Number(value) > ceiling),
    description:
      ceiling === undefined
        ? t('settings.rangeMin', {min: formatNumber(access.floor, locale)})
        : t('settings.range', {min: formatNumber(access.floor, locale), max: formatNumber(ceiling, locale)})
  };
}
export function geodataRows(assets: GeoData['assets'], locale: string, now = Date.now()) {
  return assets.map(asset => ({
    id: asset.kind,
    kind: asset.kind,
    size: formatBytes(asset.size_bytes),
    modified: relativeStart(asset.modified_at, locale, now),
    modifiedTitle: asset.modified_at ? localTime(asset.modified_at, locale) : undefined,
    sha: asset.sha256.slice(0, 12),
    shaTitle: asset.sha256,
    source: asset.source_redacted ?? '—'
  }));
}
export function profileView(
  profiles: Array<{id: string; name: string}>,
  result: {key: Key; params?: Params; error?: boolean; requestId?: string | null} | null,
  t: Translator
) {
  return {
    choices: profiles.map(profile => ({id: profile.id, label: profile.name})),
    result: result
      ? {
          text: t(result.key, result.params),
          role: result.error ? ('alert' as const) : ('status' as const),
          request: result.requestId ? t('ui.requestNote', {id: result.requestId}) : '',
          error: !!result.error
        }
      : null
  };
}
export function paletteLabel(sections: Array<{items: Array<{id: string; label: string}>}>, id: string) {
  return sections.flatMap(section => section.items).find(item => item.id === id)?.label ?? id;
}
