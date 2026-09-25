import {expect, it} from 'vitest';
import {builtinOutboundNames, builtinOutbounds, isBuiltinOutbound, newGroupPolicies, policies, policyKind} from './vocab';

it('recognises exactly the built-in outbounds, with and without (must)', () => {
  for (const name of builtinOutbounds) expect(isBuiltinOutbound(name)).toBe(true);
  expect(builtinOutbounds).toEqual(expect.arrayContaining(builtinOutboundNames));
  for (const name of ['proxy', 'direct-hk', 'Direct', '', null, undefined]) expect(isBuiltinOutbound(name)).toBe(false);
});

it('offers new groups only policies the engine accepts', () => {
  for (const {id} of newGroupPolicies) {
    expect(policies).toContain(id);
    expect(policyKind(id)).toBeDefined();
  }
});
