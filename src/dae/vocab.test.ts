import {expect, it} from 'vitest';
import {builtinOutboundNames, builtinOutbounds, isBuiltinOutbound, newGroupPolicies, policies, policyKind} from './vocab';

it('recognises exactly the built-in outbounds, with and without (must)', () => {
  for (const name of builtinOutboundNames) expect(isBuiltinOutbound(name)).toBe(true);
  // The places that replaced `=== 'direct' || === 'block'` never meant the rule-only `(must)` spelling.
  for (const name of ['direct(must)', 'block(must)']) expect(isBuiltinOutbound(name)).toBe(false);
  expect(builtinOutbounds).toEqual(expect.arrayContaining([...builtinOutboundNames]));
  for (const name of ['proxy', 'direct-hk', 'Direct', '', null, undefined]) expect(isBuiltinOutbound(name)).toBe(false);
});

it('offers new groups only policies the engine accepts', () => {
  for (const {id} of newGroupPolicies) {
    expect(policies).toContain(id);
    expect(policyKind(id)).toBeDefined();
  }
});

it('offers score, which the engine knows as its own kind', () => {
  expect(newGroupPolicies.map(item => item.id)).toContain('score');
  expect(policyKind('score')).toBe('score');
});

it('reads policies as honk does: its aliases and legacy selector fallbacks, any case, arguments ignored', () => {
  const kinds = {
    select: 'selector',
    selector: 'selector',
    fixed: 'selector',
    min: 'selector',
    random: 'selector',
    urltest: 'urltest',
    min_moving_avg: 'urltest',
    min_avg10: 'urltest',
    min_last_delay: 'urltest',
    roundrobin: 'loadbalance',
    round_robin: 'loadbalance',
    loadbalance: 'loadbalance',
    balance: 'loadbalance',
    fallback: 'fallback',
    score: 'score'
  } as const;
  for (const [name, kind] of Object.entries(kinds)) {
    expect(policyKind(name)).toBe(kind);
    expect(policyKind(` ${name.toUpperCase()} (0) `)).toBe(kind);
    expect(policyKind(`${name}(\n0)`)).toBe(kind);
  }
});

it('leaves other unknown policies unclassified', () => {
  // honk runs these as a selector with a warning, and rejects `honk`, the old name of `score`.
  for (const name of ['honk', 'custom', 'constructor', 'toString', '']) expect(policyKind(name)).toBeUndefined();
});
