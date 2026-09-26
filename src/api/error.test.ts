import {expect, it} from 'vitest';
import {LANGS, translate} from '../i18n';
import {ApiError, LocalError, errorText, failureNotice, noticeText, withoutRequestNote} from './error';

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
  const error = new LocalError('ui.operationFailed', 'Geodata update did not complete successfully', 'geodata_update_failed', {stage: 'destination_rejected'});
  expect(errorText(error, t)).toBe('The operation did not succeed: The geodata update failed (destination_rejected)');
});

it('drops the request note from a failure in every language and leaves other brackets alone', () => {
  const id = '0f8c2a4e-5b1d-4c3e-9a7f-2d6b8e1c4f90';
  for (const [lang] of LANGS) {
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
    const failure = (requestId: string | null) => errorText(new ApiError(502, 'test_failure', 'Upstream (proxy) unreachable', requestId), t);
    expect(failure(id)).toContain(id);
    expect(withoutRequestNote(failure(id))).toBe(failure(null));
  }
});
