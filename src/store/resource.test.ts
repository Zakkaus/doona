import {expect, it, vi} from 'vitest';
import {ApiError} from '../api/error';
import {gated, walk} from './resource';

type Page = {items: number[]; next_cursor: string | null};
const take = (acc: number[] | undefined, page: Page) => [...(acc ?? []), ...page.items];

it('restarts the walk from the head once when the backend refuses a cursor', async () => {
  const page = vi
    .fn<(cursor: string | undefined) => Promise<Page>>()
    .mockResolvedValueOnce({items: [1], next_cursor: 'c1'})
    .mockRejectedValueOnce(new ApiError(410, 'gone', 'snapshot gone'))
    .mockResolvedValueOnce({items: [1], next_cursor: 'c2'})
    .mockResolvedValueOnce({items: [2], next_cursor: null});
  expect(await walk(page, take)).toEqual([1, 2]);
  expect(page.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'c1', undefined, 'c2']);
});

it('fails a refused head request without asking again', async () => {
  const page = vi.fn<(cursor: string | undefined) => Promise<Page>>().mockRejectedValue(new ApiError(400, 'invalid_request', 'bad filter'));
  await expect(walk(page, take)).rejects.toMatchObject({status: 400});
  expect(page).toHaveBeenCalledTimes(1);
});

it('holds a capability-sized list back until the capabilities arrive, and stops waiting once they fail', () => {
  const capabilities = {} as Parameters<typeof gated>[0];
  expect(gated(undefined, null, true)).toEqual({enabled: false, pending: true});
  expect(gated(undefined, new Error('down'), true)).toEqual({enabled: false, pending: false});
  expect(gated(capabilities, null, true)).toEqual({enabled: true, pending: false});
  expect(gated(undefined, null, false)).toEqual({enabled: false, pending: false});
});
