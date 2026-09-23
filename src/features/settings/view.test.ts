import {expect, it} from 'vitest';
import {geodata, runtimeSettings} from '../../api/mock/fixtures';
import type {RuntimeSettingsPatch} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {numericAccess, numericFieldView, geodataRows, probeFailure, profileView, paletteLabel, recorderView, recorderPatchValue, recordingNote} from './view';
import {ApiError} from '../../api/error';
const t: Translator = (key, params) => translate('en', key, params);
it('validates numeric bounds and writes typed partial patches without losing sibling edits', () => {
  expect(numericFieldView('flows.max_flows', '63', 128, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.max_flows', '128', 128, 'en-US', t).invalid).toBe(false);
  expect(numericFieldView('flows.max_flows', '129', 128, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.retention_seconds', '1.5', undefined, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.max_flows', '100', undefined, 'en-US', t).description).toBe('At least 64');
  const patch: RuntimeSettingsPatch = {log: {level: 'debug'}};
  numericAccess['log.buffered_records'].write(patch, 128);
  numericAccess['flows.max_flows'].write(patch, 256);
  numericAccess['flows.retention_seconds'].write(patch, 10);
  numericAccess['dns_log.max_records'].write(patch, 64);
  expect(patch).toEqual({log: {level: 'debug', buffered_records: 128}, flows: {max_flows: 256, retention_seconds: 10}, dns_log: {max_records: 64}});
  expect(numericAccess['log.buffered_records'].read(runtimeSettings)).toBe(1024);
});
it('keeps full geodata digests in tooltips and handles absent provenance', () => {
  const rows = geodataRows([{...geodata.assets[0], modified_at: null, source_redacted: null}], 'en');
  expect(rows[0]).toMatchObject({sha: geodata.assets[0].sha256.slice(0, 12), shaTitle: geodata.assets[0].sha256, source: '—', modifiedAt: null});
});
it('distinguishes connection errors from successful status and falls back for unknown palettes', () => {
  const view = profileView([{id: 'a', name: 'Home'}], {key: 'settings.httpError', params: {status: 503}, error: true, requestId: 'req-1'}, t);
  expect(view.choices).toEqual([{id: 'a', label: 'Home'}]);
  expect(view.result).toMatchObject({role: 'alert', error: true});
  expect(view.result?.text).toContain('503');
  expect(view.result?.request).toContain('req-1');
  expect(profileView([], null, t).result).toBeNull();
  expect(paletteLabel([{items: [{id: 'a', label: 'Amber'}]}], 'a')).toBe('Amber');
  expect(paletteLabel([], 'custom')).toBe('custom');
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
  expect(recorderPatchValue('auto')).toBe('auto');
  expect(recorderPatchValue('on')).toBe(true);
  expect(recorderPatchValue('off')).toBe(false);
  const recording = {flows: active, logs: active, dns_log: active, events: {active: false}, grace_remaining_seconds: 0} as never;
  expect(recordingNote(recording, t)).toBe('settings.recordingDetached');
  expect(recordingNote({...(recording as object), grace_remaining_seconds: 42} as never, t)).toBe('settings.recordingGrace:{"n":42}');
  expect(recordingNote(undefined, t)).toBeNull();
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
  expect(probeFailure(new ApiError(200, 'empty_response', 'Empty'), idle, base, origin)).toEqual({key: 'settings.nonJson'});
  expect(probeFailure(new ApiError(200, 'invalid_discovery', 'Missing API version'), idle, base, origin)).toEqual({key: 'settings.invalidResponse'});
  expect(probeFailure(new ApiError(502, 'bad_gateway', 'Bad gateway'), idle, base, origin)).toEqual({key: 'settings.httpError', params: {status: 502}});
  expect(probeFailure(new SyntaxError('Unexpected token'), idle, base, origin)).toEqual({key: 'settings.nonJson'});
  expect(probeFailure(new TypeError('Failed to fetch'), idle, base, origin)).toEqual({key: 'settings.cors'});
  expect(probeFailure(new TypeError('Failed to fetch'), idle, base, 'https://router.example')).toEqual({key: 'settings.network'});
});
