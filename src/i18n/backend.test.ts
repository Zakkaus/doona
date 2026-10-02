import {expect, it} from 'vitest';
import {backendCode, backendMessage, diagnosticMessage, oneLine} from './backend';
import {LANGS, translate, type Lang, type Translator} from './index';
import type {ConfigDiagnostic} from '../api/model';

// The codes honk sets on operation.error, provider.last_error and health.error, which the contract leaves to the adapter.
const operationCodes = [
  'reload_rejected',
  'reload_degraded',
  'engine_unavailable',
  'request_exhausted',
  'lifecycle_failed',
  'geodata_update_failed',
  'probe_interrupted',
  'probe_cleanup_failed',
  'publication_rejected',
  'fetch_failed',
  'provider_replaced',
  'result_too_large',
  'route_unavailable',
  'publication_unavailable',
  'supervisor_stopped',
  'probe_cancelled',
  'probe_deadline',
  'probe_failed'
];

it.each(LANGS.map(([lang]) => lang))('translates every operation error code in %s', (lang: Lang) => {
  const t: Translator = (key, params) => translate(lang, key, params);
  for (const code of operationCodes) {
    const text = backendMessage(code, 'English message from the backend', t).summary;
    expect(text, code).not.toContain('English message');
    expect(text, code).not.toContain('ui.backend.');
  }
});

// Every per-result error emitted by honk's native_api/probes/wire.rs.
const probeResultCodes = [
  ['address_unavailable', 'ui.backend.probeAddressUnavailable'],
  ['cancelled', 'ui.backend.probeCancelled'],
  ['deadline', 'ui.backend.probeDeadline'],
  ['local_refusal', 'ui.backend.probeLocalRefusal'],
  ['probe_failed', 'ui.backend.probeFailed']
] as const;

it.each(LANGS.map(([lang]) => lang))('explains every per-result probe error in %s', (lang: Lang) => {
  const t: Translator = (key, params) => translate(lang, key, params);
  for (const [code, key] of probeResultCodes) {
    expect(backendCode(code, t), code).toBe(t(key));
    expect(backendCode(code, t), code).not.toMatch(/ui\.backend\.|_/);
  }
  expect(new Set(probeResultCodes.map(([code]) => backendCode(code, t))).size).toBe(probeResultCodes.length);
});

it('reads an inherited property name as an unknown code', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  expect(backendMessage('constructor', 'From the backend', t, {stage: 'toString'}).summary).toContain('From the backend');
  expect(backendCode('hasOwnProperty', t)).toBe('hasOwnProperty');
  expect(diagnosticMessage({code: 'constructor', message: 'From the backend', params: {}} as ConfigDiagnostic, t).summary).toContain('From the backend');
});

it('falls back to the backend message for a code it does not know', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  expect(backendMessage('adapter_specific', 'Something specific', t)).toEqual({summary: t('ui.backendMessage', {message: 'Something specific'})});
});

it('names a failed stage: in its own words when known, else beside the code', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  expect(backendMessage('geodata_update_failed', 'x', t, {stage: 'asset_validation_failed'})).toEqual({summary: t('ui.backend.assetValidationFailed')});
  expect(backendMessage('geodata_update_failed', 'x', t, {stage: 'checksum_unavailable'}).summary).toBe(
    'The file downloaded, but its .sha256sum file could not be fetched. Try again'
  );
  expect(backendMessage('checksum_unavailable', '', t)).toEqual({summary: t('ui.backend.checksumUnavailable')});
  expect(backendMessage('geodata_update_failed', 'x', t, {stage: 'route_blocked'})).toEqual({summary: t('ui.backend.routeBlocked')});
  expect(backendMessage('geodata_update_failed', 'x', t, {stage: 'resolve_failed'})).toEqual({
    summary: t('ui.aside', {text: t('ui.backend.geodataUpdateFailed'), note: 'resolve_failed'})
  });
  expect(backendMessage('geodata_update_failed', 'x', t, {committed: false})).toEqual({summary: t('ui.backend.geodataUpdateFailed')});
});

it('keeps the backend message for the codes honk reuses for unrelated failures', () => {
  const t: Translator = (key, params) => translate('zh-CN', key, params);
  expect(backendMessage('unsupported_value', 'Group field is not mutable', t)).toEqual({
    summary: t('ui.backend.unsupportedValue'),
    detail: 'Group field is not mutable'
  });
  expect(backendMessage('invalid_request', 'Unsupported record type "XYZ"', t)).toEqual({
    summary: t('ui.backend.invalidRequest'),
    detail: 'Unsupported record type "XYZ"'
  });
  expect(oneLine(backendMessage('unsupported_value', 'Group field is not mutable', t), t)).toBe(
    t('ui.valuePair', {label: t('ui.backend.unsupportedValue'), value: 'Group field is not mutable'})
  );
  expect(backendMessage('state_conflict', 'An inline node named hk-03 already exists.', t)).toEqual({
    summary: t('ui.backend.stateConflict'),
    detail: 'An inline node named hk-03 already exists.'
  });
  // A management write names the code again as its stage; the backend's words still say which conflict it was.
  expect(backendMessage('state_conflict', 'A resource with this name already exists', t, {stage: 'state_conflict'})).toEqual({
    summary: t('ui.backend.stateConflict'),
    detail: 'A resource with this name already exists'
  });
  expect(backendMessage('capability_not_supported', 'Provider refresh is not supported', t)).toEqual({summary: t('ui.backend.capabilityNotSupported')});
});

it('shows an unknown bare code as it is', () => {
  const t: Translator = (key, params) => translate('zh-TW', key, params);
  expect(backendCode('probe_failed', t)).toBe(t('ui.backend.probeFailed'));
  expect(backendCode('adapter_specific', t)).toBe('adapter_specific');
});

it.each(LANGS.map(([lang]) => lang))('names every runtime degradation code honk sets in %s', (lang: Lang) => {
  const t: Translator = (key, params) => translate(lang, key, params);
  const codes = [
    'persistence_unavailable',
    'state_cache_unavailable',
    'interface_watcher_disabled',
    'pname_routing_reduced',
    'pname_routing_disabled',
    'udp_trace_unavailable',
    'quic_probe_disabled'
  ];
  for (const code of codes) expect(backendCode(code, t), code).not.toMatch(/ui\.backend\.|_/);
  expect(new Set(codes.map(code => backendCode(code, t))).size).toBe(codes.length);
});

it('keeps the backend detail for removed configuration keys and no longer names destination policy errors', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  const message = 'setting was removed and can be deleted; its value is ignored';
  expect(diagnosticMessage({code: 'legacy-config-warning', message} as ConfigDiagnostic, t)).toEqual({
    summary: t('ui.backend.legacyConfigWarning'),
    detail: message
  });
  expect(backendMessage('destination_rejected', 'Old backend detail', t).summary).toContain('Old backend detail');
});
