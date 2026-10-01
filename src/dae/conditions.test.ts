import {expect, it} from 'vitest';
import {conditionKinds, dnsConditionKinds, ruleCondition} from './groups';
import {parseConditions, serializeConditions} from './conditions';

it('reconstructs every offered routing and DNS call, AND and negation', () => {
  for (const kinds of [conditionKinds, dnsConditionKinds.request, dnsConditionKinds.response]) {
    const rows = kinds.map((kind, i) => ({kind, value: 'first, second', negate: i % 2 === 0}));
    const text = serializeConditions(rows)!;
    expect(parseConditions(text, kinds)).toEqual(rows);
    expect(serializeConditions(parseConditions(text, kinds)!)).toBe(text);
  }
  expect(parseConditions(" !dip('2001:db8::/32')&& dport(80,443) ", conditionKinds)).toEqual([
    {kind: 'dip', value: '2001:db8::/32', negate: true},
    {kind: 'dport', value: '80, 443', negate: false}
  ]);
  expect(parseConditions('pname(\n curl,\n firefox\n)', conditionKinds)?.[0].value).toBe('curl, firefox');
  expect(parseConditions('qname(suffix: lan, home.arpa)', dnsConditionKinds.request)).toEqual([{kind: 'qnameSuffix', value: 'lan, home.arpa', negate: false}]);
  expect(parseConditions('domain(example.com)', conditionKinds)?.[0].kind).toBe('domainSuffix');
  expect(parseConditions("qname('example.com')", dnsConditionKinds.request)).toBeNull();
  expect(parseConditions("pname('abc)", conditionKinds)).toBeNull();
});

it('keeps calls the picker cannot reproduce and invalid grammar in Expression mode', () => {
  for (const raw of [
    '',
    'mac(aa:bb)',
    'domain(full: a, suffix: b)',
    'domain(regex: a)',
    'domain(full:)',
    'pname()',
    'pname(a,)',
    'pname("a b")',
    'pname("a,b")',
    'pname(a) || pname(b)',
    'pname(a) &&',
    '!!pname(a)',
    'pname(a) -> direct',
    'pname(a) # comment',
    'pname(a, #comment\n b)',
    'pname(a) trailing',
    'pname(a) && (dport(80))'
  ]) {
    expect(parseConditions(raw, conditionKinds), raw).toBeNull();
  }
  expect(parseConditions('upstream(local)', dnsConditionKinds.request)).toBeNull();
  expect(parseConditions('ip(geoip: private)', dnsConditionKinds.request)).toBeNull();
  expect(serializeConditions([])).toBeNull();
  expect(serializeConditions([{kind: 'domain', value: ', ,', negate: false}])).toBeNull();
  expect(serializeConditions([{kind: 'domain', value: '', negate: false}])).toBeNull();
  expect(serializeConditions([{kind: 'domain', value: 'a) -> block', negate: false}])).toBeNull();
  expect(serializeConditions([{kind: 'sip', value: '2001:db8::1', negate: false}])).toBe(ruleCondition('sip', '2001:db8::1'));
});
