import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {healthStatus} from './groupText';

const t: Translator = (key, params) => translate('en', key, params);
it.each([
  ['healthy', {state: 'healthy', latency_ms: 84}, {text: '84 ms', tone: 'ok'}],
  ['unavailable', {state: 'unavailable', latency_ms: null}, {text: 'Unavailable', tone: 'err'}],
  ['unknown', {state: 'unknown', latency_ms: null}, {text: '—'}],
  ['undefined', undefined, {text: '—'}]
] as const)('shows the health status for %s', (_, health, expected) => {
  expect(healthStatus(health, t)).toEqual(expected);
});
