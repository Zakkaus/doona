import {expect, it, vi} from 'vitest';
import {createMockApi} from '../../../mock';
import {readSubscriptionEntries} from '../../dae/subscriptions';
import {translate, type Translator} from '../../i18n';
import {providerRows} from './view';
import {useProviderTable as providerTable} from './useProviderTable';

vi.mock('../../i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../i18n')>()),
  useT: () => (key: Parameters<Translator>[0], params: Parameters<Translator>[1]) => translate('en', key, params),
  useLang: () => 'en'
}));

it('looks up opaque provider intervals by verified tags and keeps editing in the row actions', async () => {
  const api = createMockApi();
  const {sources} = await api.config();
  const entries = readSubscriptionEntries(sources.find(source => source.kind === 'main')!.content).map(entry => ({...entry, interval: 3600}));
  const {providers} = await api.providers();
  const {nodes} = await api.nodes();
  const rows = providerRows(
    providers.map(item => (item.kind === 'subscription' ? {...item, name: 'opaque'} : item)),
    nodes.map(node => (node.provider_id === 'harbor' ? {...node, subscription_tag: 'harbor'} : node)),
    entries,
    translate.bind(null, 'en')
  ).list;
  const input: Parameters<typeof providerTable>[0] = {
    rows,
    entries,
    loading: false,
    selected: null,
    onSelect: vi.fn(),
    canManage: true,
    canRefresh: false,
    busy: false,
    source: {main: null, writable: true, busy: false, error: null, retry: vi.fn(), apply: vi.fn()},
    refresh: {busy: null, refresh: vi.fn(), refreshMany: vi.fn()},
    refreshAll: {refreshing: false, run: vi.fn(), disabled: false, reason: null, label: ''},
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    inInclude: () => false,
    editAction: () => ({kind: 'edit', run: vi.fn()})
  };
  const row = providerTable(input).rows.find(item => item.id === 'harbor')!;
  expect(row.interval).toBe('Every 1 hour');
  expect(row.action?.kind).toBe('edit');
  expect(row.removeReason).toBeNull();
  expect(providerTable({...input, inInclude: () => true}).rows.find(item => item.id === 'harbor')!.removeReason).toBe(translate('en', 'nodes.removeInclude'));
  for (const kind of ['open', null] as const) {
    const view = providerTable({...input, editAction: () => (kind ? {kind, run: vi.fn()} : null)});
    expect(view.rows.find(item => item.id === 'harbor')!.action?.kind ?? null).toBe(kind);
  }
});
