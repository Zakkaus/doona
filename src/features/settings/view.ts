import {formatBytes} from '../../i18n/format';
import type {Capabilities, RecorderMode, RecorderState, RuntimeSettingField, RuntimeSettings, RuntimeSettingsPatch, GeoData, Version} from '../../api/model';
import {engineOf} from '../../api/engines';
import {formatList, formatNumber, type Lang, type Params, type Translator} from '../../i18n';
import {href} from '../../shell/route';
import {docsHref} from '../shared/docs';
import {geodataConfigurable} from './nav';
import {ApiError} from '../../api/error';
import type {Key} from '../../i18n';

export type Recorder = Extract<RuntimeSettingField, 'record_flows' | 'record_logs' | 'record_dns_log'>;
export type Numeric = Exclude<RuntimeSettingField, 'log.level' | Recorder | 'geodata'>;
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
    items: (['auto', 'on', 'off'] as const).map(mode => ({
      id: mode,
      // Automatic flow recording follows flow demand, which its label names.
      label: t(mode === 'auto' && id === 'record_flows' ? 'settings.record.autoFlows' : recorderChoiceLabel[mode])
    })),
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
// Automatic flow recording follows pages that ask for flows, not every open panel. The backend keeps a client
// attached for this long after its last flow request or stream.
const attachmentTailSeconds = 60;
export const flowRecordingNote = (choice: RecorderChoice, t: Translator) =>
  choice === 'auto' ? t('settings.recordFlowsAuto', {n: attachmentTailSeconds}) : null;
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
export function geodataRows(assets: GeoData['assets'], locale: string) {
  return assets.map(asset => ({
    id: asset.kind,
    kind: asset.kind,
    size: formatBytes(asset.size_bytes, locale),
    modifiedAt: asset.modified_at,
    sha: asset.sha256.slice(0, 12),
    shaTitle: asset.sha256,
    source: asset.source_redacted ?? '—',
    fetched: asset.fetched_url_redacted ?? '—',
    verified: asset.verified === true
  }));
}
export function profileView(
  profiles: Array<{id: string; name: string}>,
  result: {key: Key; params?: Params; error?: boolean; requestId?: string | null; id?: number} | null,
  t: Translator
) {
  return {
    choices: profiles.map(profile => ({id: profile.id, label: profile.name})),
    result: result
      ? {
          text: t(result.key, result.params),
          role: result.error ? ('alert' as const) : ('status' as const),
          request: result.requestId ? t('ui.requestNote', {id: result.requestId}) : '',
          error: !!result.error,
          id: result.id ?? 0
        }
      : null
  };
}
// Shared by the profile select, Rename and Delete.
export function profileReason(hasActive: boolean, t: Translator): string | null {
  return hasActive ? null : t('settings.noProfile');
}

export function runtimeApplyReason({busy, invalid, changed}: {busy: boolean; invalid: string | null; changed: boolean}, t: Translator): string | null {
  if (busy) return null;
  if (invalid) return t('settings.runtimeInvalid', {field: invalid});
  return changed ? null : t('config.noChanges');
}

export function refreshAllReason({ready, busy, count}: {ready: boolean; busy: boolean; count: number}, t: Translator): string | null {
  return ready && !busy && !count ? t('settings.noSubscriptions') : null;
}

export function geodataUpdateReason({busy, loaded, failed}: {busy: boolean; loaded: boolean; failed: boolean}, t: Translator): string | null {
  return !busy && !loaded && failed ? t('settings.geodataUnread') : null;
}

// Where the sources cannot be edited here but an update can run, the engine may take the download URLs from the
// configuration file; the note names its settings and says what editing them here needs. Null where the engine does
// not say so.
export function geodataFromConfig(
  capabilities: Capabilities | undefined,
  version: Pick<Version, 'api'> | undefined,
  t: Translator,
  lang: Lang
): {text: string; docs: {href: string; text: string}; config?: {href: string; text: string}} | null {
  const resources = capabilities?.resources;
  if (!resources?.geodata.available || resources.geodata.can_update !== true || geodataConfigurable(resources)) return null;
  const engine = engineOf(version);
  const reason = engine.reason('geodata', capabilities!);
  if (reason?.code !== 'no-download-urls') return null;
  const keys = formatList(
    lang,
    reason.settings.map(setting => engine.settingName(setting.key))
  );
  return {
    text: t('settings.geodataFromConfig', {keys}),
    docs: {href: docsHref(lang, 'state-db'), text: t('ov.lim.docsStateDb')},
    config: resources.config.available ? {href: href('config', {tab: 'source'}), text: t('nav.config')} : undefined
  };
}

export function paletteLabel(sections: Array<{items: Array<{id: string; label: string}>}>, id: string) {
  return sections.flatMap(section => section.items).find(item => item.id === id)?.label ?? id;
}
// Why a connection test failed, in the page language; null when the test was cancelled rather than timed out.
export function probeFailure(
  error: unknown,
  signal: Pick<AbortSignal, 'aborted' | 'reason'>,
  base: string,
  origin: string,
  token = ''
): {key: Key; params?: Params} | null {
  if (signal.aborted && (signal.reason as {name?: string} | undefined)?.name === 'TimeoutError') return {key: 'settings.timeout'};
  if (signal.aborted) return null;
  if (error instanceof ApiError) {
    // The backend refuses a missing and a wrong token alike; which one it was is known here.
    if (error.status === 401) return {key: token ? 'settings.tokenRejected' : 'settings.unauthorized'};
    if (error.code === 'empty_response') return {key: 'settings.nonJson'};
    if (error.code === 'invalid_discovery') return {key: 'settings.invalidResponse'};
    return {key: 'settings.httpError', params: {status: error.status}};
  }
  if (error instanceof SyntaxError) return {key: 'settings.nonJson'};
  // Fetch does not distinguish cross-origin network failures from CORS rejection.
  if (error instanceof TypeError && new URL(base).origin !== origin) return {key: 'settings.cors'};
  return {key: 'settings.network'};
}
