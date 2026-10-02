import {beforeEach, expect, it} from 'vitest';
import {DIAGNOSTICS_LIMIT, diagnosticOf, diagnostics, formatDiagnostics, recordDiagnostic, redact, scrubText} from './diagnostics';
import {ApiError, LocalError} from './error';

beforeEach(() => diagnostics.clear());

it('keeps the newest entries up to the limit and tells its listeners', () => {
  let heard = 0;
  const stop = diagnostics.subscribe(() => heard++);
  for (let n = 0; n < DIAGNOSTICS_LIMIT + 5; n++) recordDiagnostic(new Error(`failure ${n}`));
  stop();
  const kept = diagnostics.snapshot();
  expect(kept).toHaveLength(DIAGNOSTICS_LIMIT);
  expect([kept[0].message, kept.at(-1)!.message]).toEqual(['failure 5', `failure ${DIAGNOSTICS_LIMIT + 4}`]);
  expect(heard).toBe(DIAGNOSTICS_LIMIT + 5);
});

it.each([
  ['a bearer token', 'denied for Bearer abc.def-1', 'denied for Bearer [redacted]'],
  ['URL credentials and query', 'GET https://user:pw@host/a/b?token=1&x=2 failed', 'GET https://host/a/b failed'],
  ['a long text', 'x'.repeat(400), 'x'.repeat(300) + '…'],
  ['plain text', 'upstream unreachable', 'upstream unreachable']
])('scrubs %s from text', (_name, text, expected) => {
  expect(scrubText(text)).toBe(expected);
});

it.each([
  [
    'secret-like keys',
    {secret: 'a', api_token: 'b', Password: 'c', nested: {Authorization: 'd'}},
    {secret: '[redacted]', api_token: '[redacted]', Password: '[redacted]', nested: {Authorization: '[redacted]'}}
  ],
  ['body keys', {content: 'config text', body: 'b', text: 't', stage: 'write'}, {content: '[omitted]', body: '[omitted]', text: '[omitted]', stage: 'write'}],
  ['strings in arrays', {urls: ['http://h/p?key=1']}, {urls: ['http://h/p']}],
  ['deep values', {a: {b: {c: {d: {e: 1}}}}}, {a: {b: {c: {d: '[omitted]'}}}}],
  ['scalars', {written: false, count: 3, none: null}, {written: false, count: 3, none: null}]
])('redacts %s', (_name, value, expected) => {
  expect(redact(value)).toEqual(expected);
});

it('records what an API failure carries, with the path and no query', () => {
  const error = new ApiError(409, 'state_conflict', 'Changed meanwhile', 'req-1', {written: false, token: 'x'});
  error.request = {method: 'PUT', path: '/api/v1/config/main'};
  expect(diagnosticOf(error, new Date('2026-10-02T01:02:03Z'))).toEqual({
    time: '2026-10-02T01:02:03.000Z',
    request: {method: 'PUT', path: '/api/v1/config/main'},
    status: 409,
    code: 'state_conflict',
    message: 'Changed meanwhile',
    details: {written: false, token: '[redacted]'},
    requestId: 'req-1',
    operation: null
  });
});

it('records the operation of an unknown outcome and the cause of a wrapped failure', () => {
  const unknown = new LocalError('ui.operationUnknown');
  unknown.operation = {id: 'op-1', kind: 'reload', status: 'queued'};
  expect(diagnosticOf(unknown)).toMatchObject({status: null, message: 'ui.operationUnknown', operation: unknown.operation});
  const wrapped = new Error('partial', {cause: new ApiError(503, 'unavailable', 'Try later', 'req-2')});
  expect(diagnosticOf(wrapped)).toMatchObject({status: 503, code: 'unavailable', requestId: 'req-2'});
  expect(diagnosticOf('plain')).toMatchObject({status: null, message: 'plain'});
});

it('formats the versions and the page, then one block per entry without empty lines', () => {
  const error = new ApiError(502, 'upstream_unavailable', 'Upstream unreachable', 'req-3', {stage: 'write'});
  error.request = {method: 'POST', path: '/api/v1/geodata/update'};
  const unknown = new LocalError('ui.operationUnknown');
  unknown.operation = {id: 'op-9', kind: 'geodata_update', status: 'queued'};
  const entries = [diagnosticOf(error, new Date('2026-10-02T00:00:00Z')), diagnosticOf(unknown, new Date('2026-10-02T00:00:01Z'))];
  expect(formatDiagnostics(entries, {doona: '0.1.0', engine: 'honk 1.2.3', route: '/settings'})).toBe(
    [
      'doona 0.1.0',
      'engine honk 1.2.3',
      'page /settings',
      '',
      '[2026-10-02T00:00:00.000Z] POST /api/v1/geodata/update',
      'status: 502',
      'code: upstream_unavailable',
      'message: Upstream unreachable',
      'request_id: req-3',
      'details: {"stage":"write"}',
      '',
      '[2026-10-02T00:00:01.000Z]',
      'message: ui.operationUnknown',
      'operation: op-9 geodata_update queued'
    ].join('\n')
  );
  expect(formatDiagnostics([], {doona: '0.1.0', route: '/'})).toBe('doona 0.1.0\npage /');
});
