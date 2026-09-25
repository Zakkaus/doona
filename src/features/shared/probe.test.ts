import {expect, it} from 'vitest';
import type {ProbeResult} from '../../api/model';
import {translate, type Translator} from '../../i18n';
const t: Translator = (key, params) => translate('en', key, params);
import {probeToast} from './probe';

it('tells a failed probe from one whose result is unknown', () => {
  const item = (state: 'healthy' | 'unavailable' | 'unknown', latency_ms: number | null, error: string | null = null) =>
    ({member_id: 'hk', state, latency_ms, error}) as ProbeResult['results'][number];
  const result = (...results: ProbeResult['results']) => ({results}) as ProbeResult;
  expect(probeToast(result(item('healthy', 5.4)), 'hk', 'HK', t)).toEqual({kind: 'positive', text: t('nodes.probed', {name: 'HK', n: 5.4})});
  expect(probeToast(result(item('unavailable', null, 'refused')), 'hk', 'HK', t)).toEqual({kind: 'negative', text: t('nodes.probeFailed', {name: 'HK'})});
  expect(probeToast(result(item('unknown', null, 'probe timed out')), 'hk', 'HK', t)).toEqual({
    kind: 'neutral',
    text: t('nodes.probeUnknownWhy', {name: 'HK', error: 'probe timed out'})
  });
  expect(probeToast(result(item('unknown', null)), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
  expect(probeToast(result(), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
});
