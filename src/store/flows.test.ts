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
const request = {input: {domain: 'example.org', network: 'tcp' as const, dst_port: 443}, resolve: 'query' as const, recordTypes: ['A']};
it('simulates every distinct address rather than sampling the first answer', async () => {
  const api = createMockApi();
  api.dnsQuery = vi.fn().mockResolvedValue(query(['192.0.2.1', '198.51.100.1', '192.0.2.1']));
  const trace = api.routingTrace;
  api.routingTrace = vi.fn(trace);
  const result = await routingTrace(api, request, new AbortController().signal);
  expect(result.evaluations.map(item => item.dst_ip)).toEqual(['192.0.2.1', '198.51.100.1']);
  expect(api.routingTrace).toHaveBeenCalledTimes(2);
});
it.each(['generation_id', 'instance_id'] as const)('rejects a batch spanning different %s values', async field => {
  const api = createMockApi();
  api.dnsQuery = vi.fn().mockResolvedValue(query(['192.0.2.1', '198.51.100.1']));
  const trace = await api.routingTrace({input: request.input, resolve: 'none'});
  api.routingTrace = vi
    .fn()
    .mockResolvedValueOnce(trace)
    .mockResolvedValueOnce({...trace, [field]: 'changed'});
  await expect(routingTrace(api, request, new AbortController().signal)).rejects.toMatchObject({status: 409, code: 'snapshot_unavailable'});
});
it('rejects oversized answer sets explicitly without silently omitting addresses', async () => {
  const api = createMockApi();
  api.dnsQuery = vi.fn().mockResolvedValue(query(Array.from({length: 65}, (_, i) => `192.0.2.${i}`)));
  api.routingTrace = vi.fn();
  await expect(routingTrace(api, request, new AbortController().signal)).rejects.toMatchObject({status: 422, code: 'unsupported_value'});
  expect(api.routingTrace).not.toHaveBeenCalled();
});
