import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {ruleLine} from '../../dae/ruleText';
import {acceptedRule, conditionKey, pinnedPosition, ruleDialogReason, rulePositions, ruleTargets, ruleWritable} from './rule';
const t: Translator = (key, params) => translate('en', key, params);

it('offers the exact domain first, then its subdomains, the destination IP and the source IP as one host', () => {
  const text = (c: {domain?: string | null; dip?: string | null; sip?: string | null}) =>
    ruleTargets({domain: c.domain ?? null, dip: c.dip ?? null, sip: c.sip ?? null}).map(target => ruleLine(target.condition, 'proxy'));
  expect(text({domain: 'api.telegram.org.', dip: '149.154.167.220', sip: '192.168.1.20'})).toEqual([
    'domain(full: api.telegram.org) -> proxy',
    'domain(suffix: api.telegram.org) -> proxy',
    'dip(149.154.167.220/32) -> proxy',
    'sip(192.168.1.20/32) -> proxy'
  ]);
  expect(ruleTargets({domain: 'api.telegram.org', dip: null, sip: null}).map(target => target.kind)).toEqual(['domain', 'domainSuffix']);
  expect(text({dip: '2001:db8::5'})).toEqual(["dip('2001:db8::5/128') -> proxy"]);
  // A domain dae cannot hold is left out; the addresses are still offered.
  expect(text({domain: "it's.example", dip: '1.1.1.1'})).toEqual(['dip(1.1.1.1/32) -> proxy']);
  expect(text({})).toEqual([]);
});

it('compares conditions however they are spaced, quoted or displayed with their outbound', () => {
  expect(conditionKey('pname(curl) -> direct')).toBe(conditionKey('pname( curl )'));
  expect(conditionKey("dip('2001:db8::5/128') -> proxy(must)")).toBe(conditionKey('dip("2001:db8::5/128")'));
  expect(conditionKey('dip(1.1.1.1)')).not.toBe(conditionKey('dip(1.1.1.1/32)'));
  // The target however the list spells it: with or without spaces or `(must)`, bare or quoted.
  for (const shown of ['->x', '-> x', '-> x(must)', '->x(must)', "-> 'my group'", '->"my group"(must)', '-> hk-1.a']) {
    expect(conditionKey(`pname(curl) ${shown}`)).toBe(conditionKey('pname(curl)'));
  }
});

it('inserts before a vouched-for matched rule, else before the fallback, and only where the source can be written', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  const hit = (id: string, expression: string | null = null) => ({id, expression});
  const ids = (matched: {id: string; expression: string | null} | null, list = sources) =>
    rulePositions(rules, list, matched, t).map(position => [position.id, position.label]);
  expect(ids(hit('r5', r5.expression))).toEqual([
    ['r5', 'Before the matched rule'],
    ['fallback', 'Last, before the fallback'],
    ['r1', 'First']
  ]);
  expect(rulePositions(rules, sources, hit('r5'), t)[0]).toMatchObject({desc: 'domain(geosite: telegram)', matched: true, first: false});
  expect(ids(hit('r1'))).toEqual([
    ['r1', 'Before the matched rule'],
    ['fallback', 'Last, before the fallback']
  ]);
  expect(ids(null)).toEqual([
    ['fallback', 'Last, before the fallback'],
    ['r1', 'First']
  ]);
  expect(ids(hit('gone'))).toEqual(ids(null));
  // A match recorded against a rule that now reads differently is not trusted.
  expect(ids(hit('r5', 'dip(9.9.9.9)'))).toEqual(ids(null));
  expect(ids(hit('fallback'))).toEqual([
    ['fallback', 'Before the matched rule'],
    ['r1', 'First']
  ]);
  // A rule in a read-only include is not offered; the others still are.
  const readOnly = sources.map(source => (source.id === 'src-rules' ? {...source, writable: false} : source));
  expect(ids(hit('r7'), readOnly)).toEqual(ids(null));
  expect(
    ids(
      hit('r7'),
      sources.map(source => ({...source, writable: false}))
    )
  ).toEqual([]);
});

it('places rules the contract displays with their outbound, and falls back to the earliest writable rule', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const ids = (list: typeof rules, matched: string | null, from = sources) =>
    rulePositions(list, from, matched === null ? null : {id: matched, expression: null}, t).map(position => [position.id, position.label]);
  // The contract shows `pname(curl) -> direct`; honk sends the condition alone. Both name the same line.
  const shown = rules.map(rule => (rule.kind === 'rule' ? {...rule, expression: ruleLine(rule.expression, rule.outbound, rule.must)} : rule));
  expect(ids(shown, 'r5')).toEqual(ids(rules, 'r5'));
  expect(ids(shown, 'r5')).toHaveLength(3);
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  expect(rulePositions(shown, sources, {id: 'r5', expression: r5.expression}, t)[0].matched).toBe(true);
  // With the first rule in a file doona cannot write, the earliest rule it can write before is offered instead.
  const main = sources.find(source => source.id === 'src-main')!;
  const locked = [...sources, {...main, id: 'src-locked', writable: false}];
  const lockedFirst = rules.map(rule => (rule === rules[0] ? {...rule, source: {...rule.source!, source_id: 'src-locked'}} : rule));
  expect(ids(lockedFirst, null, locked)).toEqual([
    ['fallback', 'Last, before the fallback'],
    [rules[1].rule_id, 'Before rule 2']
  ]);
  expect(ids(lockedFirst, rules[0].rule_id, locked)).toEqual(ids(lockedFirst, null, locked));
});

it('keeps the pinned position while its rule exists and reports it moved after a reload removed it', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const positions = rulePositions(rules, sources, {id: 'r5', expression: null}, t);
  const pin = {generation: '40', rule: rules.find(rule => rule.rule_id === 'r5')!};
  expect(pinnedPosition(positions, null, '40')).toEqual({before: 'r5', moved: false});
  expect(pinnedPosition(positions, pin, '40')).toEqual({before: 'r5', moved: false});
  expect(pinnedPosition(positions, {...pin, rule: {...pin.rule, rule_id: 'r1'}}, '40')).toEqual({before: 'r1', moved: false});
  const reloaded = rulePositions(
    rules.filter(rule => rule.rule_id !== 'r5'),
    sources,
    {id: 'r5', expression: null},
    t
  );
  expect(pinnedPosition(reloaded, pin, '41')).toEqual({before: 'fallback', moved: true});
  // The same id in a new generation is the same rule only if it still reads the same.
  const renumbered = rulePositions(
    rules.map(rule => (rule.rule_id === 'r5' ? {...rule, expression: 'dip(9.9.9.9)'} : rule)),
    sources,
    null,
    t
  );
  expect(pinnedPosition(renumbered, pin, '41').moved).toBe(true);
});

it('says the add-rule dialog is loading while what it needs is read, then that an outbound is missing', () => {
  const idle = {waiting: true, outbound: false, busy: false, failed: false, unplaceable: false};
  expect(ruleDialogReason(idle, t)).toBe('Loading…');
  expect(ruleDialogReason({...idle, waiting: false}, t)).toBe('Choose an outbound');
  expect(ruleDialogReason({...idle, waiting: false, outbound: true}, t)).toBeNull();
  // A failed read and a missing position have their own notices in the dialog; a write in flight shows as pending.
  expect(ruleDialogReason({...idle, failed: true}, t)).toBeNull();
  expect(ruleDialogReason({...idle, unplaceable: true}, t)).toBeNull();
  expect(ruleDialogReason({...idle, busy: true}, t)).toBeNull();
});

it('offers editing a matched rule only when doona can locate it in a writable source', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const rule = rules.find(rule => rule.rule_id === 'r5')!;
  expect(ruleWritable(rule, sources)).toBe(true);
  expect(ruleWritable(undefined, sources)).toBe(false);
  // An implicit fallback has no source to write.
  expect(ruleWritable({...rule, source: null}, sources)).toBe(false);
  expect(
    ruleWritable(
      rule,
      sources.map(source => ({...source, writable: false}))
    )
  ).toBe(false);
});

it('finds the rule a write added in the reloaded list, the nearest before the rule it went before in its source', async () => {
  const api = createMockApi();
  const {rules} = await api.rules();
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  const added = (id: string, index: number, source = r5.source) => ({
    ...r5,
    rule_id: id,
    index,
    source,
    expression: 'domain(full: a.example)',
    outbound: 'proxy'
  });
  const at = rules.indexOf(r5);
  // The same rule held twice: once first in the list, once before the rule it was placed in front of.
  const reloaded = [added('n1', 0), ...rules.slice(0, at), added('n2', at), ...rules.slice(at)];
  expect(acceptedRule(reloaded, 'domain(full: a.example)', 'proxy', r5)).toBe('n2');
  expect(acceptedRule(reloaded, 'domain(full: a.example)', 'proxy', {...r5, expression: 'dip(9.9.9.9)'})).toBe('n1');
  expect(acceptedRule(reloaded, 'domain(full: a.example)', 'direct', r5)).toBeNull();
  expect(acceptedRule(rules, 'domain(full: a.example)', 'proxy', r5)).toBeNull();
  // Another write landed between the added rule and its anchor; a copy in another source does not count.
  const other = {...r5.source!, source_id: 'elsewhere'};
  const between = [added('n1', 0), ...rules.slice(0, at), added('n2', at), rules[0], added('n3', at, other), ...rules.slice(at)];
  expect(acceptedRule(between, 'domain(full: a.example)', 'proxy', r5)).toBe('n2');
});
