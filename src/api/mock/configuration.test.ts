import {expect, it} from 'vitest';
import {createMockApi} from './index';

it('shares accepted routing rules and the mutable DNS cache with tracing', async () => {
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = `group { 'edited-group': { policy: fixed(0) } proxy { policy: fixed(0) } resilient { policy: fixed(0) } }
dns { routing { request { fallback: unused } } }
routing { domain(suffix: telegram.org) -> edited-group
  fallback: block
}`;
  await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  const rules = await api.rules();
  expect(rules.rules.map(rule => [rule.expression, rule.outbound])).toEqual([
    ['domain(suffix: telegram.org)', 'edited-group'],
    ['fallback: block', 'block']
  ]);
  const request = {input: {network: 'tcp' as const, domain: 'api.telegram.org', dst_port: 443}, resolve: 'live' as const};
  const trace = await api.routingTrace(request);
  expect(trace.generation_id).toBe(rules.generation_id);
  expect(trace.evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'edited-group'});
  expect(trace.evaluations[0].rules.map(rule => rule.rule_id)).toEqual(rules.rules.map(rule => rule.rule_id));
  const fallback = await api.routingTrace({input: {...request.input, domain: 'example.org'}, resolve: 'none'});
  expect(fallback.evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'block'});
  await api.flushDnsCache();
  const flushed = await api.routingTrace(request);
  expect(flushed.dns).toMatchObject([{cache: 'miss', addresses: []}]);
  expect(flushed.evaluations).toEqual([]);
});
