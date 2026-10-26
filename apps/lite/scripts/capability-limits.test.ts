import {expect, it, vi} from 'vitest';
import {capabilities} from '../../../mock/fixtures/capabilities';
import {createMockApi} from '../src/demo/createMockApi';
import {groupProbeSize, probeGroup, readProviders} from '../src/api';
import {readNodePage} from '../src/config';

it('pages providers with the backend default page size', async () => {
  const caps = structuredClone(capabilities);
  caps.resources.providers.max_page_size = 25;
  const api = await createMockApi({capabilities: caps, isolated: true});
  const all = (await createMockApi({isolated: true}).providers()).providers;
  expect((await readProviders(api)).map(item => item.id)).toEqual(all.map(item => item.id));
});

it('reads the Nodes page without providers when the backend has none', async () => {
  const caps = structuredClone(capabilities);
  caps.resources.providers.available = false;
  const api = await createMockApi({capabilities: caps, isolated: true});
  const page = await readNodePage({api, capabilities: caps, address: 'test'});
  expect(page.providers).toEqual([]);
  expect(page.nodes.length).toBeGreaterThan(0);
});

it('probes a group with the declared IP family', async () => {
  const caps = structuredClone(capabilities);
  caps.resources.probes.ip_versions = ['ipv4'];
  const api = await createMockApi({capabilities: caps, isolated: true});
  const start = vi.spyOn(api, 'startProbe');
  const group = await api.group((await api.groups())[0].id);
  await probeGroup({api, capabilities: caps, address: 'test'}, group);
  expect(start.mock.calls.every(([request]) => request.ip_version === 'ipv4')).toBe(true);
});

it('splits a group larger than the member limit into jobs within it', async () => {
  const api = await createMockApi({isolated: true});
  const limits = capabilities.resources.probes.limits!;
  const groups = await Promise.all((await api.groups()).map(item => api.group(item.id)));
  const group = groups.find(item => item.members.length > limits.max_members_per_job)!;
  expect(group).toBeDefined();
  const start = vi.spyOn(api, 'startProbe');
  await probeGroup({api, capabilities, address: 'test'}, group);
  const size = groupProbeSize(capabilities);
  expect(start.mock.calls.length).toBe(Math.ceil(group.members.length / size));
  expect(start.mock.calls.flatMap(([request]) => request.members as string[])).toEqual(group.members.map(member => member.id));
});
