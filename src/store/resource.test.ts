import {expect, it, vi} from 'vitest';
import {ApiError} from '../api/error';
import {walk} from './resource';

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
