import {expect, it} from 'vitest';
import type {ProbeResult} from '../../api/model';
import {translate, type Translator} from '../../i18n';
const t: Translator = (key, params) => translate('en', key, params);
import {probeToast} from './probe';

it('tells a failed probe from one whose result is unknown', () => {
  const item = (state: 'healthy' | 'unavailable' | 'unknown', latency_ms: number | null, error: string | null = null, ip_version = 'ipv4') =>
    ({member_id: 'hk', state, latency_ms, error, ip_version}) as ProbeResult['results'][number];
  const result = (...results: ProbeResult['results']) => ({results}) as ProbeResult;
  expect(probeToast(result(item('healthy', 5.4)), 'hk', 'HK', t)).toEqual({kind: 'positive', text: t('nodes.probed', {name: 'HK', n: 5.4})});
  expect(probeToast(result(item('unavailable', null, 'refused')), 'hk', 'HK', t)).toEqual({kind: 'negative', text: t('nodes.probeFailed', {name: 'HK'})});
  expect(probeToast(result(item('unknown', null, 'deadline')), 'hk', 'HK', t)).toEqual({
    kind: 'neutral',
    text: t('nodes.probeUnknownWhy', {name: 'HK', error: t('ui.backend.probeDeadline')})
  });
  // A reason without words of its own is left out rather than shown as a bare code.
  expect(probeToast(result(item('unknown', null, 'socket_gone')), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
  expect(probeToast(result(item('unknown', null)), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
  expect(probeToast(result(), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
});

it('folds the IPv4 and IPv6 rows of a probe into one state', () => {
  const item = (ip_version: 'ipv4' | 'ipv6', state: 'healthy' | 'unavailable' | 'unknown', latency_ms: number | null = null) =>
    ({
      member_id: 'hk',
      ip_version,
      state,
      latency_ms,
      error: state === 'unavailable' ? 'probe_failed' : state === 'unknown' ? 'address_unavailable' : null
    }) as ProbeResult['results'][number];
  const toast = (...results: ProbeResult['results']) => probeToast({results} as ProbeResult, 'hk', 'HK', t);
  expect(toast(item('ipv4', 'unavailable'), item('ipv6', 'healthy', 12))).toEqual({kind: 'positive', text: t('nodes.probed', {name: 'HK', n: 12})});
  expect(toast(item('ipv4', 'unavailable'), item('ipv6', 'unknown'))).toEqual({kind: 'negative', text: t('nodes.probeFailed', {name: 'HK'})});
  expect(toast(item('ipv4', 'unavailable'), item('ipv6', 'unavailable'))).toEqual({kind: 'negative', text: t('nodes.probeFailed', {name: 'HK'})});
  expect(toast(item('ipv4', 'unknown'), item('ipv6', 'unknown')).kind).toBe('neutral');
});
