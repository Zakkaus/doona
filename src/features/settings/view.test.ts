import {expect, it} from 'vitest';
import {geodata, runtimeSettings} from '../../api/mock/fixtures';
import {capabilities} from '../../api/mock/fixtures/capabilities';
import {version} from '../../api/mock/fixtures/runtime';
import type {Capabilities, RuntimeSettingsPatch} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {
  geodataFromConfig,
  geodataRows,
  geodataUpdateReason,
  numericAccess,
  numericFields,
  numericFieldView,
  probeFailure,
  profileReason,
  profileView,
  recorderAccess,
  recorderFields,
  recorderView,
  flowRecordingNote,
  recordingNote,
  runtimeApplyReason
} from './view';
import {ApiError} from '../../api/error';
const t: Translator = (key, params) => translate('en', key, params);
it('validates numeric bounds and writes typed partial patches without losing sibling edits', () => {
  expect(numericFieldView('flows.max_flows', '63', 64, 128, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.max_flows', '128', 64, 128, 'en-US', t).invalid).toBe(false);
  expect(numericFieldView('flows.max_flows', '129', 64, 128, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.retention_seconds', '1.5', 1, undefined, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.max_flows', '100', 64, undefined, 'en-US', t).description).toBe('At least 64');
  expect(numericFieldView('flows.max_flows', '1', 1, undefined, 'en-US', t).invalid).toBe(false);
  const patch: RuntimeSettingsPatch = {log: {level: 'debug'}};
  numericAccess['log.buffered_records'].write(patch, 128);
  numericAccess['flows.max_flows'].write(patch, 256);
  numericAccess['flows.retention_seconds'].write(patch, 10);
  numericAccess['dns_log.max_records'].write(patch, 64);
  expect(patch).toEqual({log: {level: 'debug', buffered_records: 128}, flows: {max_flows: 256, retention_seconds: 10}, dns_log: {max_records: 64}});
  expect(numericAccess['log.buffered_records'].read(runtimeSettings)).toBe(1024);
  expect(numericAccess['flows.max_flows'].read({...runtimeSettings, flows: undefined})).toBeUndefined();
});
it('keeps full geodata digests in tooltips and handles absent provenance', () => {
  const rows = geodataRows([{...geodata.assets[0], modified_at: null, source_redacted: null}], 'en');
  expect(rows[0]).toMatchObject({sha: geodata.assets[0].sha256.slice(0, 12), shaTitle: geodata.assets[0].sha256, source: '—', modifiedAt: null});
});
it('distinguishes connection errors from successful status', () => {
  const view = profileView([{id: 'a', name: 'Home'}], {key: 'settings.httpError', params: {status: 503}, error: true, requestId: 'req-1'}, t);
  expect(view.choices).toEqual([{id: 'a', label: 'Home'}]);
  expect(view.result).toMatchObject({role: 'alert', error: true});
  expect(view.result?.text).toContain('503');
  expect(view.result?.request).toContain('req-1');
  expect(profileView([], null, t).result).toBeNull();
});

it('offers a control for every setting its access table covers, in table order', () => {
  expect(recorderFields).toEqual(['record_flows', 'record_logs', 'record_dns_log']);
  expect(recorderFields).toEqual(Object.keys(recorderAccess));
  expect(numericFields).toEqual(['log.buffered_records', 'dns_log.max_records', 'flows.max_flows', 'flows.retention_seconds']);
  expect(numericFields).toEqual(Object.keys(numericAccess));
});
it('recorder controls follow the reported state and the wire form', () => {
  const t = ((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)) as unknown as Translator;
  const active = recorderView('record_flows', 'auto', {allowed: true, mode: 'auto', active: true}, t);
  expect(active.tone).toBe('ok');
  expect(active.disabled).toBe(false);
  expect(active.items.map(item => item.id)).toEqual(['auto', 'on', 'off']);
  const forbidden = recorderView('record_logs', 'auto', {allowed: false, mode: 'auto', active: false}, t);
  expect(forbidden.tone).toBe('muted');
  expect(forbidden.disabled).toBe(true);
  expect(forbidden.status).toBe('settings.recordingForbidden');
  expect(recorderView('record_dns_log', 'off', undefined, t).tone).toBe('neutral');
  const recording = {flows: active, logs: active, dns_log: active, events: {active: false}, grace_remaining_seconds: 0} as never;
  expect(recordingNote(recording, t)).toBe('settings.recordingDetached');
  expect(recordingNote({...(recording as object), grace_remaining_seconds: 42} as never, t)).toBe('settings.recordingGrace:{"n":42}');
  expect(recordingNote(undefined, t)).toBeNull();
  expect(recordingNote({} as never, t)).toBeNull();
});

it('names the pages that make automatic flow recording capture', () => {
  const auto = (id: 'record_flows' | 'record_logs') => recorderView(id, 'auto', undefined, t).items.find(item => item.id === 'auto')?.label;
  expect(auto('record_flows')).toBe('On flow demand');
  expect(auto('record_logs')).toBe('With panel');
  expect(flowRecordingNote('auto', t)).toContain('60');
  expect(flowRecordingNote('on', t)).toBeNull();
  for (const lang of ['zh-TW', 'zh-CN'] as const)
    for (const key of ['settings.record.autoFlows', 'settings.recordFlowsAuto'] as const) expect(translate(lang, key)).not.toBe(translate('en', key));
});

it('names why a connection test failed and ignores a cancelled test', () => {
  const idle = {aborted: false, reason: undefined};
  const base = 'https://router.example/api';
  const origin = 'https://doona.example';
  expect(probeFailure(new Error('late'), {aborted: true, reason: new DOMException('Connection timeout', 'TimeoutError')}, base, origin)).toEqual({
    key: 'settings.timeout'
  });
  expect(probeFailure(new DOMException('Aborted', 'AbortError'), {aborted: true, reason: new DOMException('Aborted', 'AbortError')}, base, origin)).toBeNull();
  expect(probeFailure(new ApiError(401, 'authentication_required', 'Token required'), idle, base, origin)).toEqual({key: 'settings.unauthorized'});
  expect(probeFailure(new ApiError(401, 'authentication_required', 'Token required'), idle, base, origin, 'wrong')).toEqual({key: 'settings.tokenRejected'});
  expect(probeFailure(new ApiError(200, 'empty_response', 'Empty'), idle, base, origin)).toEqual({key: 'settings.nonJson'});
  expect(probeFailure(new ApiError(200, 'invalid_discovery', 'Missing API version'), idle, base, origin)).toEqual({key: 'settings.invalidResponse'});
  expect(probeFailure(new ApiError(502, 'bad_gateway', 'Bad gateway'), idle, base, origin)).toEqual({key: 'settings.httpError', params: {status: 502}});
  expect(probeFailure(new SyntaxError('Unexpected token'), idle, base, origin)).toEqual({key: 'settings.nonJson'});
  expect(probeFailure(new TypeError('Failed to fetch'), idle, base, origin)).toEqual({key: 'settings.cors'});
  expect(probeFailure(new TypeError('Failed to fetch'), idle, base, 'https://router.example')).toEqual({key: 'settings.network'});
});

it('says the profile actions wait for a saved profile', () => {
  expect(profileReason(false, t)).toBe('No profile yet; saving the backend creates one');
  expect(profileReason(true, t)).toBeNull();
});

it('says why Apply for backend options is disabled only for a value out of range, not for having nothing to apply', () => {
  const idle = {busy: false, invalid: null};
  expect(runtimeApplyReason(idle, t)).toBeNull();
  expect(runtimeApplyReason({...idle, invalid: 'Flow table size'}, t)).toBe('Flow table size must be a whole number within the range shown');
  expect(runtimeApplyReason({busy: true, invalid: 'x'}, t)).toBeNull();
});

it('says a geodata update needs its status, and nothing while it loads', () => {
  expect(geodataUpdateReason({busy: false, loaded: false, failed: true}, t)).toBe('The geodata status could not be read, so it cannot be updated');
  expect(geodataUpdateReason({busy: false, loaded: false, failed: false}, t)).toBeNull();
  expect(geodataUpdateReason({busy: true, loaded: false, failed: true}, t)).toBeNull();
  expect(geodataUpdateReason({busy: false, loaded: true, failed: true}, t)).toBeNull();
});

it('notes URLs from the configuration file only where sources are fixed but an update can run', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  const fixed = (geodata: Partial<Capabilities['resources']['geodata']>): Capabilities => ({
    ...capabilities,
    resources: {...capabilities.resources, geodata: {available: true, can_update: true, assets: ['geosite', 'geoip'], ...geodata}}
  });
  const note = geodataFromConfig(fixed({}), version, t, 'en');
  expect(note?.text).toBe(t('settings.geodataFromConfig', {keys: 'experimental.native_api.geosite_download_url, experimental.native_api.geoip_download_url'}));
  expect(note?.docs.text).toBe(t('ov.lim.docsStateDb'));
  expect(note?.config?.href).toContain('config');
  expect(geodataFromConfig(fixed({can_update: false}), version, t, 'en')).toBeNull();
  expect(geodataFromConfig(fixed({configurable_sources: true}), version, t, 'en')).toBeNull();
  expect(geodataFromConfig(capabilities, version, t, 'en')).toBeNull();
  const other = {...version, engine: {...version.engine, name: 'other'}};
  expect(geodataFromConfig(fixed({}), other, t, 'en')).toBeNull();
  expect(geodataFromConfig(fixed({}), undefined, t, 'en')).toBeNull();
});
