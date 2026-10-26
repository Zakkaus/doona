import {expect, it, vi} from 'vitest';
import type {Api} from '../../../src/api/api';
import type {Node, OperationAccepted, OperationState, ProbeRequest} from '../../../src/api/model';
import {capabilities} from '../../../mock/fixtures/capabilities';
import {createNodeProbes} from '../src/nodeProbeState';

const node = (id: string, protocol = 'vless'): Node => ({id, name: id, protocol, provider_id: 'inline', subscription_tag: null, group_ids: [], health: []});
function setup() {
  const requests: ProbeRequest[] = [];
  const write = vi.fn();
  const api = {
    startProbe: vi.fn(async (request: ProbeRequest): Promise<OperationAccepted> => {
      requests.push(request);
      return {operation_id: request.target.type === 'node' ? request.target.node_id : '', kind: 'probe', status: 'queued', href: '', retryAfter: 0};
    }),
    pollOperation: vi.fn(
      async (accepted: OperationAccepted) =>
        ({
          kind: 'probe',
          status: 'succeeded',
          result: {
            results: [
              {member_id: accepted.operation_id, transport: 'tcp', state: 'unavailable', latency_ms: null},
              {
                member_id: accepted.operation_id,
                transport: 'tcp',
                state: accepted.operation_id === 'down' ? 'unavailable' : 'healthy',
                latency_ms: accepted.operation_id === 'down' ? null : 31.6
              }
            ]
          }
        }) as OperationState
    ),
    replaceConfigSource: write
  } as unknown as Api;
  const connection = {api, capabilities: structuredClone(capabilities), address: 'test'};
  return {connection, requests, write};
}
it('probes only supported node targets, accepts either IP family, and never writes configuration', async () => {
  const {connection, requests, write} = setup();
  const probes = createNodeProbes(connection);
  await probes.run([node('up'), node('down'), node('unsupported', 'block'), node('future', 'unknown-protocol')], 'feed');
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual({target: {type: 'node', node_id: 'up'}, kind: 'http', transport: ['tcp'], ip_version: 'any', warmth: 'cold'});
  expect(probes.results.get('up')).toBe(31.6);
  expect(probes.results.get('down')).toBe('timeout');
  expect(probes.summaries.get('feed')).toEqual({answered: 1, total: 4, unsupported: 2});
  expect(probes.supports(node('unsupported', 'block'))).toBe(false);
  expect(write).not.toHaveBeenCalled();
});
it('uses the advertised IP family and refuses an unavailable target capability', async () => {
  const {connection, requests} = setup();
  connection.capabilities.resources.probes.ip_versions = ['ipv6'];
  await createNodeProbes(connection).run([node('up')]);
  expect(requests[0].ip_version).toBe('ipv6');
  connection.capabilities.resources.probes.targets = ['group'];
  const probes = createNodeProbes(connection);
  expect(probes.available).toBe(false);
  await probes.run([node('up')]);
  expect(requests).toHaveLength(1);
});
it('keeps request failures distinct from a measured timeout and releases the running state', async () => {
  const {connection} = setup();
  connection.api.startProbe = vi.fn().mockRejectedValue(new Error('offline'));
  const probes = createNodeProbes(connection);
  await probes.run([node('up')]);
  expect(probes.results.get('up')).toBe('failed');
  expect(probes.running).toBeNull();
  expect(probes.error).toBeInstanceOf(Error);
});
it('does not enqueue more work after leaving the page', async () => {
  const {connection, requests} = setup();
  const probes = createNodeProbes(connection);
  probes.active = false;
  await probes.run([node('up')]);
  expect(requests).toHaveLength(0);
});
