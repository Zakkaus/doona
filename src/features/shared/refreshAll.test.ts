import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {refreshAllReason} from './refreshAll';

const t: Translator = (key, params) => translate('en', key, params);

it('says why refreshing every subscription is disabled only once the list is read and empty', () => {
  expect(refreshAllReason({ready: true, busy: false, count: 0}, t)).toBe('No subscriptions to update');
  expect(refreshAllReason({ready: false, busy: false, count: 0}, t)).toBeNull();
  expect(refreshAllReason({ready: true, busy: true, count: 0}, t)).toBeNull();
  expect(refreshAllReason({ready: true, busy: false, count: 2}, t)).toBeNull();
});
