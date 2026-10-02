import {expect, it} from 'vitest';
import {createMockApi} from '../mock';
import {routingTrace} from './routing';

it.each([
  [undefined, 'indeterminate', null, ['dscp']],
  [0, 'determinate', 'direct', []],
  [46, 'determinate', 'direct', []],
  [63, 'determinate', 'direct', []],
  [8, 'determinate', 'proxy', []]
] as const)('evaluates dscp(0,46,63) with DSCP %j', async (dscp, decision, outbound, missing_inputs) => {
  const api = createMockApi();
  const snapshot = await api.rules();
  snapshot.rules = [{...snapshot.rules[0], expression: 'dscp(0,46,63)', outbound: 'direct', kind: 'rule'}];
  const input = {network: 'tcp' as const, domain: 'example.com', dst_port: 443, ...(dscp !== undefined ? {dscp} : {})};
  const result = routingTrace({input, resolve: 'none'}, snapshot, await api.dnsCache());
  expect(result.evaluations[0]).toMatchObject({decision, outbound, missing_inputs});
});

it.each(['dscp(0x2e)', 'dscp(0X2E)', 'dscp(046)', '!dscp(0,8)'])('matches DSCP 46 in %s', async expression => {
  const api = createMockApi();
  const snapshot = await api.rules();
  snapshot.rules = [{...snapshot.rules[0], expression, outbound: 'direct', kind: 'rule'}];
  const result = routingTrace({input: {network: 'tcp', domain: 'example.com', dst_port: 443, dscp: 46}, resolve: 'none'}, snapshot, await api.dnsCache());
  expect(result.evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'direct', missing_inputs: []});
});
