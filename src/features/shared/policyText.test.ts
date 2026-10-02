import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {groupEditSafe, groupPolicyText, policyChoices, policyLabel} from './policyText';
const t: Translator = (key, params) => translate('en', key, params);

for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
  it.each([
    [null, 'Manual', '手動選擇', '手动选择'],
    ['select', 'Manual', '手動選擇', '手动选择'],
    ['selector', 'Manual', '手動選擇', '手动选择'],
    ['fixed', 'Manual', '手動選擇', '手动选择'],
    ['fixed(0)', 'Manual', '手動選擇', '手动选择'],
    ['random', 'Manual', '手動選擇', '手动选择'],
    ['min', 'Manual', '手動選擇', '手动选择'],
    ['min_last_delay', 'Fastest on average', '平均最快', '平均最快'],
    ['min_avg10', 'Fastest on average', '平均最快', '平均最快'],
    ['min_moving_avg', 'Fastest on average', '平均最快', '平均最快'],
    ['urltest', 'Fastest on average', '平均最快', '平均最快'],
    ['roundrobin', 'Load balance', '負載平衡', '负载均衡'],
    ['round_robin', 'Load balance', '負載平衡', '负载均衡'],
    ['loadbalance', 'Load balance', '負載平衡', '负载均衡'],
    ['balance', 'Load balance', '負載平衡', '负载均衡'],
    ['fallback', 'First available', '依序備援', '按顺序备用'],
    ['score', 'Score', '綜合評分', '综合评分'],
    [' MIN_AVG10 (0) ', 'Fastest on average', '平均最快', '平均最快'],
    ['future(1)', 'future(1)', 'future(1)', 'future(1)'],
    [' Future(2) ', ' Future(2) ', ' Future(2) ', ' Future(2) '],
    ['constructor', 'constructor', 'constructor', 'constructor']
  ])(`labels %s in ${lang} without rewriting unknown values`, (value, en, tw, cn) => {
    const local: Translator = (key, params) => translate(lang, key, params);
    const expected = {en, 'zh-TW': tw, 'zh-CN': cn}[lang];
    expect(policyLabel(value, local)).toBe(expected);
    if (value) {
      expect(policyChoices(value, local).items.find(item => item.id === value)?.label).toBe(expected);
      expect(groupPolicyText({kind: 'selector', native: value}, local)).toEqual(expected === value ? {label: expected} : {label: expected, id: value});
    }
  });
}

it('offers a policy the picker does not list as its own choice', () => {
  const kept = policyChoices('min_avg10', t);
  expect(kept.selected).toBe('min_avg10');
  expect(kept.items[0]).toEqual({id: 'min_avg10', label: t('policy.kind.urltest')});
  expect(policyChoices('fallback', t).items.map(item => item.id)).toEqual(['min_moving_avg', 'score', 'fallback', 'roundrobin', 'select']);
  expect(policyChoices(null, t).selected).toBe('select');
});

it('names a live native policy with its engine spelling beside it', () => {
  expect(groupPolicyText({kind: 'urltest', native: 'min_avg10'}, t)).toEqual({label: t('policy.kind.urltest'), id: 'min_avg10'});
  expect(groupPolicyText({kind: 'selector', native: 'fixed(0)'}, t)).toEqual({label: t('policy.kind.selector'), id: 'fixed(0)'});
  expect(groupPolicyText({kind: 'urltest', native: 'min_moving_avg'}, t)).toEqual({label: t('policy.kind.urltest'), id: 'min_moving_avg'});
  expect(groupPolicyText({kind: 'fallback', native: ''}, t)).toEqual({label: t('policy.kind.fallback'), id: 'fallback'});
});

it('accepts an unchanged multi-line filter and checks only edited values', () => {
  const entry = {filters: ['name(a,\n  b)'], policy: 'select'};
  expect(groupEditSafe(['name(a,\n  b)'], 'select', entry)).toBe(true);
  expect(groupEditSafe(['name(a) # x'], 'select', entry)).toBe(false);
});

// honk keeps the current node until it fails; a node earlier in the order that recovers does not take over again.
it('describes fallback as staying on the current node until it fails', () => {
  expect(translate('en', 'group.policy.fallbackHint')).toBe('Uses the current node until it fails, then the next in order');
});

it('offers score as its own choice, selected and named in words', () => {
  const choices = policyChoices('score', t);
  expect(choices.selected).toBe('score');
  expect(choices.items.find(item => item.id === 'score')).toEqual({id: 'score', label: 'Score', desc: t('group.policy.scoreHint')});
  expect(policyLabel('score', t)).toBe('Score');
  expect(groupPolicyText({kind: 'score', native: 'score'}, t)).toEqual({label: 'Score', id: 'score'});
  expect(groupEditSafe(['name(a)'], 'score', {filters: ['name(a)'], policy: 'select'})).toBe(true);
});
