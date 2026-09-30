import {expect, it} from 'vitest';
import {LANGS, translate} from '../i18n';
import {ApiError, LocalError, errorLines, errorText, failureNotice, noticeText, requestIdOf, responseError} from './error';

it('joins a local error and its detail with the colon of the active language', () => {
  const error = new LocalError('ui.operationFailed', 'member refused');
  // U+FF1A is the full-width colon.
  expect(errorText(error, (key, params) => translate('zh-TW', key, params))).toBe(`${translate('zh-TW', 'ui.operationFailed')}：member refused`);
  expect(errorText(error, (key, params) => translate('en', key, params))).toBe('The operation did not succeed: member refused');
});

it('reports a failure under the summary of its action, and an unknown operation outcome neutrally on its own', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
  const summary = t('ov.operationError');
  expect(failureNotice(new LocalError('ui.operationUnknown'), t, summary)).toEqual({kind: 'neutral', text: t('ui.operationUnknown')});
  expect(failureNotice(new LocalError('ui.operationFailed'), t, summary)).toEqual({kind: 'negative', text: summary, detail: t('ui.operationFailed')});
  expect(noticeText(failureNotice(new Error('offline'), t, summary), t)).toBe('Could not run the operation: offline');
});

it('reports a file written but not applied without the failure wording that says it was not written', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
  const error = new LocalError('ui.writtenNotApplied', 'Reload rejected');
  expect(failureNotice(error, t, t('ui.writeFailed'))).toEqual({kind: 'negative', text: t('ui.writtenNotApplied'), detail: 'Reload rejected'});
});

it('keeps the failed stage a backend operation names', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
  const error = new LocalError('ui.operationFailed', 'Geodata update did not complete successfully', 'geodata_update_failed', {stage: 'resolve_failed'});
  expect(errorText(error, t)).toBe('The operation did not succeed: The geodata update failed (resolve_failed)');
});

it('formats request IDs only when requested and leaves backend punctuation alone', () => {
  const id = '0f8c2a4e-5b1d-4c3e-9a7f-2d6b8e1c4f90';
  for (const [lang] of LANGS) {
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
    const failure = (requestId: string | null) => errorText(new ApiError(502, 'test_failure', 'Upstream (proxy) unreachable', requestId), t);
    expect(failure(id)).toContain(id);
    expect(errorText(new ApiError(502, 'test_failure', 'Upstream (proxy) unreachable', id), t, false)).toBe(failure(null));
    expect(errorText(new ApiError(502, 'test_failure', 'Backend (request_id: its own) failed', id), t, false)).toContain('(request_id: its own)');
  }
});

it('gives a reused code the backend message as its detail, with the request note after it', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('zh-CN', key, params);
  const error = new ApiError(422, 'unsupported_value', 'Group field is not mutable', 'abc');
  expect(errorLines(error, t)).toEqual({summary: t('ui.backend.unsupportedValue'), detail: 'Group field is not mutable（request_id：abc）'});
  const notice = failureNotice(error, t, t('ui.writeFailed'));
  expect(notice).toEqual({
    kind: 'negative',
    text: t('ui.writeFailed'),
    detail: t('ui.valuePair', {label: t('ui.backend.unsupportedValue'), value: 'Group field is not mutable'}),
    requestId: 'abc'
  });
  expect(noticeText(notice, t)).toContain('request_id：abc');
  const refused = new ApiError(409, 'state_conflict', 'The connection is observed by eBPF but its transport is not owned by userspace.', 'abc');
  expect(errorLines(refused, t)).toEqual({
    summary: t('ui.backend.stateConflict'),
    detail: 'The connection is observed by eBPF but its transport is not owned by userspace.（request_id：abc）'
  });
  expect(errorLines(new ApiError(404, 'capability_not_supported', 'Provider refresh is not supported', 'abc'), t)).toEqual({
    summary: t('ui.backend.capabilityNotSupported') + '（request_id：abc）'
  });
});

const reasons = [
  ['writes_disabled', 'ui.refusal.writesDisabled'],
  ['configuration_unavailable', 'ui.refusal.configurationUnavailable'],
  ['listener_secret_source', 'ui.refusal.listenerSecretSource'],
  ['listener_secret_in_content', 'ui.refusal.listenerSecretInContent'],
  ['listener_settings_changed', 'ui.refusal.listenerSettingsChanged'],
  ['credential_sources_changed', 'ui.refusal.credentialSourcesChanged'],
  ['import_entry_changed', 'ui.refusal.importEntryChanged'],
  ['unsafe_path', 'ui.refusal.unsafePath']
] as const;

it.each(reasons)('shows the recovery for %s in every language before the code, stage or message', (reason, key) => {
  for (const [lang] of LANGS) {
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
    const error = new ApiError(403, 'permission_denied', 'Backend refusal', 'refusal-9', {reason, stage: 'write'});
    expect(errorText(error, t, false)).toBe(t(key));
    expect(errorText(error, t)).toBe(t(key) + t('ui.requestNote', {requestId: 'refusal-9'}));
    expect(errorText(new LocalError('ui.operationFailed', error.message, error.code, error.details), t)).toBe(t(key));
  }
});

const configurationCodes = [
  [403, 'permission_denied', 'ui.backend.permissionDenied'],
  [404, 'capability_not_supported', 'ui.backend.capabilityNotSupported'],
  [503, 'temporarily_unavailable', 'ui.backend.temporarilyUnavailable'],
  [400, 'invalid_request', 'ui.backend.invalidRequest']
] as const;

it.each(configurationCodes)('renders configuration-write refusals for HTTP %s %s without a code prefix', (status, code, key) => {
  for (const [lang] of LANGS) {
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
    for (const details of [null, {}, {reason: 'future_reason'}, {reason: 'constructor'}, {reason: 42}, {reason: 'credential_sources_changed'}]) {
      const error = new ApiError(status, code, 'A specific refusal', null, details);
      error.configurationWrite = true;
      expect(errorLines(error, t)).toEqual({
        summary: details?.reason === 'credential_sources_changed' ? t('ui.refusal.credentialSourcesChanged') : 'A specific refusal'
      });
      error.message = '';
      expect(errorText(error, t)).toBe(details?.reason === 'credential_sources_changed' ? t('ui.refusal.credentialSourcesChanged') : t(key));
    }
  }
});

it.each([
  [422, 'unsupported_value', 'ui.backend.unsupportedValue'],
  [409, 'state_conflict', 'ui.backend.stateConflict'],
  [412, 'stale_revision', 'ui.backend.staleRevision'],
  [428, 'precondition_required', 'ui.backend.preconditionRequired'],
  [413, 'request_too_large', 'ui.backend.requestTooLarge'],
  [415, 'unsupported_media_type', 'ui.backend.unsupportedMediaType'],
  [429, 'rate_limited', 'ui.backend.rateLimited']
] as const)('keeps the existing mapping for other configuration-write errors: HTTP %s %s', (status, code, key) => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
  const error = new ApiError(status, code, 'Backend detail');
  error.configurationWrite = true;
  expect(errorLines(error, t)).toEqual({summary: t(key), ...(['unsupported_value', 'state_conflict'].includes(code) ? {detail: 'Backend detail'} : {})});
});

it.each([null, {}, {reason: 'unrelated_reason'}])('keeps ordinary permission errors localized: %j', details => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('zh-TW', key, params);
  expect(errorLines(new ApiError(403, 'permission_denied', 'Access denied', null, details), t)).toEqual({summary: t('ui.backend.permissionDenied')});
});

it('carries reason and other details from an HTTP error into the recovery text', async () => {
  const error = await responseError(
    new Response(
      JSON.stringify({
        error: {code: 'permission_denied', message: 'Refused', details: {reason: 'credential_sources_changed', stage: 'write'}},
        request_id: 'http-9'
      }),
      {status: 403}
    )
  );
  expect(error.details).toEqual({reason: 'credential_sources_changed', stage: 'write'});
  expect(errorText(error, (key, params) => translate('en', key, params), false)).toBe('The sources declaring API secrets have changed. Reload honk and retry.');
});

it('finds the request id on a failure or on the failure that stopped a partial one', () => {
  const cause = new ApiError(502, 'upstream_unavailable', 'Upstream unreachable', 'probe-9');
  expect(requestIdOf(cause)).toBe('probe-9');
  expect(requestIdOf(Object.assign(new LocalError('ui.operationFailed'), {cause}))).toBe('probe-9');
  expect(requestIdOf(new ApiError(502, 'upstream_unavailable', 'Upstream unreachable'))).toBeUndefined();
  expect(requestIdOf(new Error('offline'))).toBeUndefined();
});

it('shows refusal recovery directly for a failed operation', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
  const error = new LocalError('ui.operationFailed', 'Refused', 'permission_denied', {reason: 'credential_sources_changed'});
  expect(errorText(error, t)).toBe('The sources declaring API secrets have changed. Reload honk and retry.');
});
