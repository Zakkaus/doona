import {expect, it, vi} from 'vitest';
import type {ConfigSource} from '../api/model';
import {sha256} from '../api/hash';

// One render of the hook at a time: state lives here, effects run at once, and each state update is recorded.
const hook = vi.hoisted(() => ({state: [] as unknown[], updates: 0, slot: 0}));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void) => void effect(),
  useState: <T>(initial: T) => {
    const slot = hook.slot++;
    if (!(slot in hook.state)) hook.state[slot] = initial;
    return [
      hook.state[slot],
      (update: (current: T) => T) => {
        const next = update(hook.state[slot] as T);
        if (next !== hook.state[slot]) hook.updates++;
        hook.state[slot] = next;
      }
    ];
  }
}));
// Called as a plain function: the mock above stands in for one component's render.
const {useCompleteness: completeness} = await import('./config');

const mount = (sources: ConfigSource[]) => {
  hook.state = [];
  hook.slot = 0;
  hook.updates = 0;
  return completeness(sources);
};
const rerender = (sources: ConfigSource[]) => {
  hook.slot = 0;
  return completeness(sources);
};

it('answers at once on a second mount of the same texts, and re-renders only for new verdicts', async () => {
  const content = 'global {}\n';
  const sources = [
    {id: 'main', content, content_sha256: await sha256(content)},
    {id: 'cut', content: 'glob', content_sha256: await sha256(content)}
  ] as ConfigSource[];
  const first = mount(sources);
  expect(first(sources[0])).toBeUndefined();
  await vi.waitFor(() => expect(hook.updates).toBe(1));
  const checked = rerender(sources);
  expect([checked(sources[0]), checked(sources[1])]).toEqual([true, false]);

  const again = mount(sources);
  expect([again(sources[0]), again(sources[1])]).toEqual([true, false]);
  await Promise.resolve();
  expect(hook.updates).toBe(0);

  // A text edited since keeps no answer until it is checked.
  const edited = {...sources[0], content: 'global { }\n'} as ConfigSource;
  expect(again(edited)).toBeUndefined();
});
