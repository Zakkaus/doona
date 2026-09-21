import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {queryTypes} from './query';

it('queries every requested type within the advertised bound and preserves all results', async () => {
  const api = createMockApi();
  const types = ['A', 'AAAA', 'MX', 'TXT', 'HTTPS'];
  const batches: string[][] = [];
  const result = await queryTypes(
    async (domain, batch, signal) => {
      expect(batch.length).toBeLessThanOrEqual(2);
      batches.push(batch);
      return api.dnsQuery(domain, batch, signal);
    },
    'example.com',
    types,
    2,
    new AbortController().signal
  );
  expect(batches).toEqual([['A', 'AAAA'], ['MX', 'TXT'], ['HTTPS']]);
  expect(result.results.map(item => item.type)).toEqual(types);
});

it('does not issue another batch or return partial success after cancellation', async () => {
  const api = createMockApi();
  const controller = new AbortController();
  const requested: string[] = [];
  await expect(
    queryTypes(
      async (domain, types) => {
        requested.push(...types);
        const result = await api.dnsQuery(domain, types);
        controller.abort();
        return result;
      },
      'example.com',
      ['A', 'AAAA'],
      1,
      controller.signal
    )
  ).rejects.toMatchObject({name: 'AbortError'});
  expect(requested).toEqual(['A']);
});
