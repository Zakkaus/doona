import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {coverageView} from './coverage';

const t: Translator = (key, params) => translate('en', key, params);

it('suppresses full coverage and keeps exact dropped counts and partial scopes', async () => {
  const list = await createMockApi().flows();
  const coverage = Object.fromEntries(Object.keys(list.coverage).map(scope => [scope, 'full'])) as typeof list.coverage;
  expect(coverageView({coverage, dropped_records: null}, t, 'en')).toBeNull();
  const view = coverageView({coverage: {...coverage, userspace_tcp: 'partial', kernel_direct: 'none'}, dropped_records: '18446744073709551615'}, t, 'en')!;
  expect(view.dropped).toContain('18,446,744,073,709,551,615');
  expect(view.summary).toBe(t('flow.coverageSummary', {n: 2}));
  expect(view.detail).toContain(t('flow.userspaceTcp'));
  expect(view.detail).toContain(t('flow.partialVisibility'));
  expect(view.detail).toContain(t('flow.kernelDirect'));
  expect(view.detail).toContain(t('ui.none'));
});
