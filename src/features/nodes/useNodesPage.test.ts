import {expect, it, vi} from 'vitest';
import {replaceRoute} from '../../shell/route';
import type {ConfigSource} from '../../api/model';
import {subscriptionActionKind} from './view';
import {runSubscriptionAction} from './useNodesPage';

vi.mock('../../shell/route', async importOriginal => ({
  ...(await importOriginal<typeof import('../../shell/route')>()),
  replaceRoute: vi.fn()
}));

it.each(['edit', 'open'])('consumes action parameters before a subscription %s without losing list filters', kind => {
  const events: string[] = [];
  vi.mocked(replaceRoute).mockImplementation((path, query) => events.push(`${path}?${query}`));
  runSubscriptionAction('editSubscription=harbor&focus=interval&tab=list&q=first&provider=inline', {run: () => events.push(kind)});
  expect(events).toEqual(['nodes?tab=list&q=first&provider=inline', kind]);
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
