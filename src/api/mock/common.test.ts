import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';

afterEach(() => vi.useRealTimers());
it('continues the retained DNS snapshot after deleting its first entry', async () => {
  const api = createMockApi();
  const original = await api.dnsCache();
  const first = await api.dnsCache({limit: 1});
  await api.deleteDnsEntry(first.entries[0].entry_id);
  const rest = await api.dnsCache({cursor: first.next_cursor!, limit: 1000});
  expect([first.entries[0], ...rest.entries]).toEqual(original.entries);
  expect(rest.total).toBe(original.total);
  expect((await api.dnsCache()).entries.some(entry => entry.entry_id === first.entries[0].entry_id)).toBe(false);
});
it('rejects a cursor used with different filters, resources, or adapter instances', async () => {
  const api = createMockApi();
  const first = await api.nodes({limit: 1});
  const cursor = first.next_cursor!;
  await expect(api.nodes({cursor, group_id: 'proxy'})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
  await expect(api.providers({cursor})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
  await expect(createMockApi().nodes({cursor})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
});
it('expires retained snapshots with resource-specific cursor errors', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const nodes = await api.nodes({limit: 1});
  const flows = await api.flows({limit: 1});
  await vi.advanceTimersByTimeAsync(30000);
  await expect(api.nodes({cursor: nodes.next_cursor!})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
  await expect(api.flows({cursor: flows.next_cursor!})).rejects.toMatchObject({status: 410, code: 'snapshot_expired'});
});
