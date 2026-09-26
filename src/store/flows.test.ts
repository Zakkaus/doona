import {expect, it, vi} from 'vitest';
import {createMockApi} from '../api/mock';
import {routingTrace} from './flows';
import type {DnsQueryResponse} from '../api/model';

function query(addresses: string[]): DnsQueryResponse {
  return {
    domain: 'example.org',
    cache_mode: 'normal',
    query_time: '2026-09-22T00:00:00Z',
    results: [
      {
        type: 'A',
        status: 'NOERROR',
        cached: false,
        cache_entry_id: null,
        upstream: null,
        route: {source: 'default', rule: null},
        question: {name: 'example.org', type: 'A'},
        elapsed_ms: 1,
        answers: addresses.map(data => ({name: 'example.org', type: 'A', class: 'IN', ttl: 30, data}))
      }
    ]
  };
}
function dual(v4: string[], v6: string[]): DnsQueryResponse {
  const a = query(v4);
  const aaaa = query(v6).results[0];
  return {...a, results: [...a.results, {...aaaa, type: 'AAAA', answers: aaaa.answers!.map(answer => ({...answer, type: 'AAAA'}))}]};
}
const request = {input: {domain: 'example.org', network: 'tcp' as const, dst_port: 443}, resolve: 'query' as const, recordTypes: ['A']};
it('simulates the first IPv4 and the first IPv6 answer and keeps every answer', async () => {
  const api = createMockApi();
  api.dnsQuery = vi.fn().mockResolvedValue(dual(['192.0.2.1', '198.51.100.1', '192.0.2.1'], ['2001:db8::1', '2001:db8::2']));
  const trace = api.routingTrace;
  api.routingTrace = vi.fn(trace);
  const result = await routingTrace(api, {...request, recordTypes: ['A', 'AAAA']}, new AbortController().signal);
  expect(result.evaluations.map(item => item.dst_ip)).toEqual(['192.0.2.1', '2001:db8::1']);
  expect(api.routingTrace).toHaveBeenCalledTimes(2);
  expect(result.dns.map(item => [item.qtype, item.addresses, item.selected_ip])).toEqual([
    ['A', ['192.0.2.1', '198.51.100.1', '192.0.2.1'], '192.0.2.1'],
    ['AAAA', ['2001:db8::1', '2001:db8::2'], '2001:db8::1']
  ]);
});
it.each(['generation_id', 'instance_id'] as const)('rejects a batch spanning different %s values', async field => {
  const api = createMockApi();
  api.dnsQuery = vi.fn().mockResolvedValue(dual(['192.0.2.1'], ['2001:db8::1']));
  const trace = await api.routingTrace({input: request.input, resolve: 'none'});
  api.routingTrace = vi
    .fn()
    .mockResolvedValueOnce(trace)
    .mockResolvedValueOnce({...trace, [field]: 'changed'});
  await expect(routingTrace(api, {...request, recordTypes: ['A', 'AAAA']}, new AbortController().signal)).rejects.toMatchObject({
    status: 409,
    code: 'snapshot_unavailable'
  });
});
