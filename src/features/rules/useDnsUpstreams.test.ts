import {beforeEach, expect, it, vi} from 'vitest';
import type {ConfigSource} from '../../api/model';

const state = vi.hoisted(() => ({slots: [] as unknown[], slot: 0, sources: [] as ConfigSource[], fail: '', writes: [] as string[]}));
vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const i = state.slot++;
    if (!(i in state.slots)) state.slots[i] = initial;
    return [
      state.slots[i],
      (next: unknown) => {
        state.slots[i] = next;
      }
    ];
  }
}));
vi.mock('../../api', () => ({getApi: () => ({})}));
vi.mock('../../i18n', () => ({useT: () => (key: string) => key}));
vi.mock('../../ui/ui', () => ({toast: vi.fn()}));
vi.mock('../../store/config', () => ({useCompleteness: () => () => true}));
vi.mock('../../store', () => ({
  useCapabilities: () => ({data: {resources: {config: {available: true, writable: true}}}}),
  useConfig: () => ({data: {sources: state.sources}}),
  readConfigFresh: async () => ({sources: state.sources}),
  refetchAll: vi.fn(),
  useConfigEditor: () => ({
    apply: async (source: ConfigSource, content: string) => {
      state.writes.push(source.id);
      if (state.fail === 'reference' && source.id === 'include') {
        state.fail = '';
        return undefined;
      }
      state.sources = state.sources.map(item => (item.id === source.id ? {...item, content, content_sha256: content} : item));
      if (state.fail === 'poll') {
        state.fail = '';
        return undefined;
      }
      return {result: {}};
    }
  })
}));
const {useDnsUpstreams: renderController} = await import('./useDnsUpstreams');
const render = () => {
  state.slot = 0;
  return renderController();
};
beforeEach(() => {
  state.slots = [];
  state.fail = '';
  state.writes = [];
  state.sources = [
    {id: 'main', kind: 'main', content: 'dns {\n upstream {\n primary: udp://1.1.1.1:53\n }\n}\n'},
    {id: 'include', kind: 'include', content: 'dns { routing { request { fallback: primary } } }'}
  ].map(source => ({...source, writable: true, content_sha256: source.content, path: source.id}) as ConfigSource);
});
const openRename = () => {
  const model = render();
  model.open(model.rows[0].id);
  const opened = render();
  opened.setDraft({...opened.draft!, name: 'secondary'});
};
it('refuses a draft after the store refreshes with an external address edit', async () => {
  openRename();
  state.sources = state.sources.map(source => ({...source, content: source.content!.replace('1.1.1.1', '9.9.9.9'), content_sha256: 'new'}));
  await render().save();
  expect(state.writes).toEqual([]);
  expect(render().failure).toBe('rule.stale');
});
it.each(['poll', 'reference'])('resumes a rename after a %s failure without abandoning the alias', async failure => {
  openRename();
  state.fail = failure;
  await render().save();
  expect(state.sources[0].content).toContain('secondary:');
  render().close();
  expect(render().draft).not.toBeNull();
  await render().save();
  expect(render().draft).toBeNull();
  expect(state.sources.map(source => source.content).join('')).not.toContain('primary');
});
