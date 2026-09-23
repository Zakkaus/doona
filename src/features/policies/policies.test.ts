import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {groupPolicyText, policyChoices, policyLabel} from './policies';
const t: Translator = (key, params) => translate('en', key, params);

it('names offered policies in words and keeps any other as written', () => {
  expect(policyLabel('fallback', t)).toBe(t('arrange.policy.fallback'));
  expect(policyLabel(null, t)).toBe(t('arrange.policy.manual'));
  expect(policyLabel('fixed(0)', t)).toBe('fixed(0)');
});

it('offers a policy the picker does not list as its own choice', () => {
  const kept = policyChoices('min_avg10', t);
  expect(kept.selected).toBe('min_avg10');
  expect(kept.items[0]).toEqual({id: 'min_avg10', label: 'min_avg10'});
  expect(policyChoices('fallback', t).items.map(item => item.id)).toEqual(['min_moving_avg', 'fallback', 'roundrobin', 'select']);
  expect(policyChoices(null, t).selected).toBe('select');
});

it('names a live policy the picker does not offer by its kind, with the engine spelling beside it', () => {
  expect(groupPolicyText({kind: 'urltest', native: 'min_avg10'}, t)).toEqual({label: t('policy.kind.urltest'), id: 'min_avg10'});
  expect(groupPolicyText({kind: 'selector', native: 'fixed(0)'}, t)).toEqual({label: t('policy.kind.selector'), id: 'fixed(0)'});
  expect(groupPolicyText({kind: 'urltest', native: 'min_moving_avg'}, t)).toEqual({label: t('arrange.policy.fastest'), id: 'min_moving_avg'});
  expect(groupPolicyText({kind: 'fallback', native: ''}, t)).toEqual({label: t('policy.kind.fallback'), id: 'fallback'});
});
