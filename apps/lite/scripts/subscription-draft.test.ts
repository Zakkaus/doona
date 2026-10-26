import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ConfigSource, Provider} from '../../../src/api/model';
import {readSubscriptionEntries} from '../../../src/dae/subscriptions';
import {applyContent, refreshProvider, type Connection} from '../src/api';
import {refreshAdded, stageSubscription} from '../src/subscriptionDraft';
import {stageDraft} from '../src/useFeatureDraft';

vi.mock('../src/api', async original => ({...(await original<typeof import('../src/api')>()), applyContent: vi.fn(), refreshProvider: vi.fn()}));

const source = {
  id: 'main',
  writable: true,
  content: `subscription {
  a: 'https://a.example/feed'
  b: 'https://b.example/feed'
}
`
} as ConfigSource;
const connection = {api: {config: async () => ({sources: [source]})}} as unknown as Connection;
const provider = (id: string) => ({id, name: id, kind: 'subscription'}) as Provider;

function pageDraft() {
  let state: ReturnType<typeof stageDraft>;
  return {
    get state() {
      return state;
    },
    get content() {
      return state?.content ?? source.content;
    },
    stage: (content: string, key: string, summary: string) => {
      state = stageDraft(state, source, content, key, summary);
    }
  };
}

beforeEach(() => vi.clearAllMocks());

describe('subscription writes', () => {
  it('stages a delete next to another entry staged edit instead of applying either', async () => {
    const draft = pageDraft();
    await stageSubscription(connection, source, draft, {kind: 'edit', name: 'a', url: 'https://a2.example/feed'}, 'edit a');
    await stageSubscription(connection, source, draft, {kind: 'delete', name: 'b', url: ''}, 'delete b');
    expect(applyContent).not.toHaveBeenCalled();
    expect(draft.state?.source).toBe(source);
    expect(draft.state?.summary).toEqual({'subscription:a': 'edit a', 'subscription:b': 'delete b'});
    expect(readSubscriptionEntries(draft.content).map(entry => [entry.tag, entry.url])).toEqual([['a', 'https://a2.example/feed']]);
  });

  it('stages an add with its interval', async () => {
    const draft = pageDraft();
    await stageSubscription(connection, source, draft, {kind: 'add', name: 'c', url: 'https://c.example/feed', interval: 3600}, 'add c');
    expect(applyContent).not.toHaveBeenCalled();
    expect(readSubscriptionEntries(draft.content).find(entry => entry.tag === 'c')).toMatchObject({url: 'https://c.example/feed', interval: 3600});
  });

  it('refreshes only subscriptions the apply added and reports a failed refresh as partial', async () => {
    vi.mocked(refreshProvider)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('offline'));
    const notice = await refreshAdded(connection, [provider('a')], [provider('a'), provider('c'), provider('d')]);
    expect(vi.mocked(refreshProvider).mock.calls.map(call => call[1])).toEqual(['c', 'd']);
    expect(notice).toEqual({key: 'refreshPartial'});
  });

  it('reports a degraded refresh as partial and a clean one as nothing', async () => {
    vi.mocked(refreshProvider).mockResolvedValueOnce({degraded: true} as never);
    expect(await refreshAdded(connection, [], [provider('c')])).toEqual({key: 'refreshPartial'});
    vi.mocked(refreshProvider).mockResolvedValueOnce({} as never);
    expect(await refreshAdded(connection, [], [provider('c')])).toBeUndefined();
  });
});
