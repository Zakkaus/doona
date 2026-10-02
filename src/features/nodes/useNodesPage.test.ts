import {expect, it, vi} from 'vitest';
import {replaceRoute} from '../../shell/route';
import type {ConfigSource} from '../../api/model';
import {subscriptionActionKind} from './view';
import {runSubscriptionAction} from './useNodesPage';

vi.mock('../../shell/route', async importOriginal => ({
  ...(await importOriginal<typeof import('../../shell/route')>()),
  replaceRoute: vi.fn()
}));

it.each(['editSubscription', 'editSubscriptionTag'])('consumes %s before a subscription action without losing list filters', parameter => {
  const events: string[] = [];
  vi.mocked(replaceRoute).mockImplementation((path, query) => events.push(`${path}?${query}`));
  runSubscriptionAction(`${parameter}=harbor&focus=interval&tab=list&q=first&provider=inline`, {run: () => events.push('edit')});
  expect(events).toEqual(['nodes?tab=list&q=first&provider=inline', 'edit']);
});

it.each([true, false])('waits for source validation before consuming a subscription link (%s)', complete => {
  const events: string[] = [];
  vi.mocked(replaceRoute).mockImplementation((path, query) => events.push(`${path}?${query}`));
  const source = {writable: true} as ConfigSource;
  for (const verdict of [undefined, complete]) {
    const kind = subscriptionActionKind(true, true, true, source, verdict);
    runSubscriptionAction('editSubscription=harbor&focus=interval&tab=list', kind && {run: () => events.push(kind)});
    expect(events).toEqual(verdict === undefined ? [] : ['nodes?tab=list', complete ? 'edit' : 'open']);
  }
});
