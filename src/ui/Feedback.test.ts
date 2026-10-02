import {beforeEach, expect, it} from 'vitest';
import {diagnostics} from '../api/diagnostics';
import {ApiError, LocalError} from '../api/error';
import {translate} from '../i18n';
import {toast, toastErrorDetail, toastFailure} from './Feedback';

const en = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
beforeEach(() => diagnostics.clear());

it('passes the request ID separately from translated toast detail', () => {
  const error = new ApiError(502, 'upstream_unavailable', 'Upstream (proxy) unreachable', 'request-42');
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
    const detail = toastErrorDetail(error, t);
    expect(detail.requestId).toBe('request-42');
    expect(detail.detail).toContain('Upstream (proxy) unreachable');
    expect(detail.detail).not.toContain('request-42');
    expect(detail.error).toBe(error);
  }
});

// What is recorded, and so offered for copying, follows the error object a toast is about, never the toast's kind.
it.each([
  ['a negative failure', () => toastFailure(new ApiError(500, 'internal', 'Boom'), en, 'Failed'), 1],
  ['a neutral unknown outcome', () => toastFailure(new LocalError('ui.operationUnknown'), en, 'Failed'), 1],
  ['a conflict refusal', () => toastFailure(new ApiError(409, 'state_conflict', 'Busy'), en, 'Failed'), 1],
  ['a plain error under a neutral toast', () => toast('neutral', 'Check again', {error: new Error('offline')}), 1],
  ['an error under an info toast', () => toast('info', 'Partly done', {...toastErrorDetail(new ApiError(0, 'timeout', 'Slow'), en)}), 1],
  ['a success', () => toast('positive', 'Done'), 0],
  ['an info notice', () => toast('info', 'Heads up'), 0],
  ['a negative notice about no error', () => toast('negative', 'Nothing written'), 0]
])('records %s only when it comes from an error', (_name, show, recorded) => {
  show();
  expect(diagnostics.snapshot()).toHaveLength(recorded);
});
