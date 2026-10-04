import {useT, useLang, LOCALE} from '../../i18n';
import type {Provider} from '../../api/model';
import {useProviderRefresh} from '../../store';
import {toast, toastFailure} from '../../ui/ui';
import {type MainSourceEdit} from '../../store/mainSource';
import {type SubscriptionText} from '../../dae/subscriptions';
import {providerRowView, type ProviderRow} from './view';
import type {useRefreshAll} from '../shared/useRefreshAll';

type ProviderTableInput = {
  rows: ProviderRow[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  canManage: boolean;
  canRefresh: boolean;
  busy: boolean;
  source: MainSourceEdit;
  entries: SubscriptionText[];
  refresh: ReturnType<typeof useProviderRefresh>;
  refreshAll: ReturnType<typeof useRefreshAll>;
  onAdd: () => void;
  onRemove: (item: Provider) => void;
  // Whether the declaring source of a subscription rules out removing it here.
  inInclude: (item: ProviderRow) => boolean;
  // Edit where the declaring source takes the write, otherwise the source file to open; null when neither applies.
  editAction: (item: ProviderRow) => {kind: 'edit' | 'open'; run: () => void} | null;
};
export function useProviderTable(input: ProviderTableInput) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const {refresh} = input;
  const intervals = new Map(input.entries.map(entry => [entry.tag, entry.interval]));
  const rows = input.rows.map(item => ({
    ...providerRowView(item, intervals.get(item.configTag ?? item.sourceTag ?? ''), locale, t),
    action: input.editAction(item),
    editLabel: t('nodes.edit', {name: item.displayName ?? item.name}),
    refreshable: item.kind === 'subscription' && input.canRefresh,
    refreshing: refresh.busy === item.id,
    refreshDisabled: !!refresh.busy,
    refresh: () =>
      void refresh.refresh(item.id).then(
        result => {
          if (!result) return;
          if ('degraded' in result) toast('warning', t('nodes.refreshedDegraded', {name: item.name}));
          else toast('positive', t('nodes.refreshed', {name: item.name, n: result.node_count}));
        },
        error => toastFailure(error, t, t('nodes.refreshFailed', {name: item.name}))
      ),
    removable: input.canManage && (item.kind === 'subscription' || item.kind === 'file'),
    removeReason: input.inInclude(item) ? t('nodes.removeInclude') : null,
    remove: () => {
      if (item.kind === 'subscription' || item.kind === 'file') input.onRemove(item);
    }
  }));
  return {
    rows,
    loading: input.loading,
    selected: input.selected,
    onSelect: input.onSelect,
    canManage: input.canManage,
    busy: input.busy,
    // An edit writes the file that declares the entry, which need not be the main source.
    editBusy: input.source.busy,
    // Refreshing every subscription, as Settings offers it, where the backend can refresh them.
    refreshAll: input.canRefresh ? input.refreshAll : null,
    onAdd: input.onAdd
  };
}

export type ProviderTableView = {
  rows: Array<{
    id: string;
    name: string;
    url?: string;
    kind: string;
    count: string;
    usage: string;
    quota: ReturnType<typeof providerRowView>['quota'];
    updatedAt: string | null;
    expires: string;
    expiresShort: string;
    interval: string;
    status: string | null;
    tone: 'ok' | 'warn' | 'err' | 'neutral';
    error?: string;
    refreshLabel: string;
    removeLabel: string;
    action: {kind: 'edit' | 'open'; run: () => void} | null;
    editLabel: string;
    refreshable: boolean;
    refreshing: boolean;
    refreshDisabled: boolean;
    refresh: () => void;
    removable: boolean;
    removeReason: string | null;
    remove: () => void;
  }>;
  loading: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  canManage: boolean;
  busy: boolean;
  editBusy: boolean;
  refreshAll: ReturnType<typeof useRefreshAll> | null;
  onAdd: () => void;
};
