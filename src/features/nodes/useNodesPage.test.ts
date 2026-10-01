import {expect, it, vi} from 'vitest';
import {replaceRoute} from '../../shell/route';
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
