import {expect, it, vi} from 'vitest';
import type {ReactElement} from 'react';
import type {ConfigSource} from '../../api/model';

const state = vi.hoisted(() => ({effects: [] as Array<() => void>, context: null as unknown, finish: () => {}, accepted: () => {}}));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<object>()),
  useRef: (current: unknown) => ({current}),
  useContext: () => state.context,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useEffect: (fn: () => (() => void) | undefined) => {
    const cleanup = fn();
    if (cleanup) state.effects.push(cleanup);
  }
}));
vi.mock('../../api/index', () => ({getApi: () => ({})}));
vi.mock('../../i18n', () => ({useT: () => (key: string) => key}));
vi.mock('../../ui/ui', () => ({toast: vi.fn(), Button: 'button', Card: 'section', InlineAlert: 'aside'}));
vi.mock('../../store', async () => {
  const pending = await import('../../store/pendingRules');
  const {useEffect} = await import('react');
  const source = {
    id: 'main',
    kind: 'main',
    writable: true,
    path: 'main.dae',
    content: 'dns {\n routing {\n request {\n fallback: primary\n }\n }\n}'
  } as ConfigSource;
  return {
    ...pending,
    useConfig: () => ({data: {sources: [source]}}),
    readConfigFresh: async () => ({sources: [source]}),
    refetchAll: vi.fn(),
    useConfigEditor: () => {
      const controller = new AbortController();
      useEffect(() => () => controller.abort(), [controller]);
      return {
        apply: async (_source: ConfigSource, transform: (text: string) => string) => {
          transform(source.content!);
          state.accepted();
          await new Promise<void>(resolve => {
            state.finish = resolve;
          });
          return controller.signal.aborted ? undefined : {result: {}};
        }
      };
    }
  };
});
const {useApplyHeld} = await import('./usePendingApply');
const {pendingRules} = await import('../../store/pendingRules');
const {PendingRules} = await import('../rules/PendingRules');
it('finishes an accepted write after the pending card unmounts', async () => {
  pendingRules.add({list: 'response', before: null, condition: 'ip(1.1.1.1)', outbound: 'accept', must: false, sourceId: 'main'});
  state.context = useApplyHeld().apply;
  state.effects = [];
  const card = PendingRules({review: false})!;
  const head = card.props.children[0] as ReactElement<{children: ReactElement<{onPress?: () => Promise<void>}>[]}>;
  const button = head.props.children.find(child => child?.props?.onPress)!;
  const accepted = new Promise<void>(resolve => {
    state.accepted = resolve;
  });
  const done = button.props.onPress!();
  await accepted;
  state.effects.forEach(cleanup => cleanup());
  state.finish();
  await done;
  expect(pendingRules.snapshot()).toMatchObject({rules: [], applying: false, failure: null});
});
