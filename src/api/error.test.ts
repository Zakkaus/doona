import {expect, it} from 'vitest';
import {translate} from '../i18n';
import {LocalError, errorText, failureNotice} from './error';

it('joins a local error and its detail with the colon of the active language', () => {
  const error = new LocalError('ui.operationFailed', 'member refused');
  // U+FF1A is the full-width colon.
  expect(errorText(error, (key, params) => translate('zh-TW', key, params))).toBe(`${translate('zh-TW', 'ui.operationFailed')}：member refused`);
  expect(errorText(error, (key, params) => translate('en', key, params))).toBe('The operation did not succeed: member refused');
});

it('reports an unknown operation outcome neutrally and without the failure wording around it', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
  const wrap = (error: string) => t('ov.operationError', {error});
  expect(failureNotice(new LocalError('ui.operationUnknown'), t, wrap)).toEqual({kind: 'neutral', text: t('ui.operationUnknown')});
  expect(failureNotice(new LocalError('ui.operationFailed'), t, wrap)).toEqual({kind: 'negative', text: wrap(t('ui.operationFailed'))});
});
