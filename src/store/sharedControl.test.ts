import {expect, it} from 'vitest';
import {createMockApi} from '../api/mock';
import {sharedControl} from './sharedControl';

it('shares drafts within a backend and preserves them without subscribers', () => {
  const api = createMockApi();
  const first = sharedControl<string | null>(api, 'mode', null);
  first.set('direct');
  expect(sharedControl(api, 'mode', null).value).toBe('direct');
  expect(sharedControl(createMockApi(), 'mode', null).value).toBeNull();
});

import {actionCell} from './action';
it('locks shared writes synchronously and releases them after failure', async () => {
  const api = createMockApi();
  const first = actionCell(api, 'group:x');
  const second = actionCell(api, 'group:x');
  let finish!: (result: number) => void;
  const pending = first.run(
    'selection',
    () =>
      new Promise<number>(resolve => {
        finish = resolve;
      }),
    false
  );
  expect(second.snapshot().busy).toBe('selection');
  expect(await second.run('selection', async () => 2, false)).toBeUndefined();
  expect(actionCell(createMockApi(), 'group:x').snapshot().busy).toBeNull();
  finish(1);
  expect(await pending).toBe(1);
  await second.run(
    'selection',
    async () => {
      throw new Error('refused');
    },
    false
  );
  expect(first.snapshot()).toMatchObject({busy: null, error: new Error('refused')});
  expect(await first.run('selection', async () => 3, false)).toBe(3);
});
