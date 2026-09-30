import {useT, useLang, LOCALE} from '../../i18n';
import type {Provider} from '../../api/model';
import {useProviderRefresh} from '../../store';
import {toast, toastFailure} from '../../ui/ui';
import {editProblem, type MainSourceEdit} from '../../store/mainSource';
import {writeSubscriptionEntry, type SubscriptionText} from '../../dae/subscriptions';
import {providerRowView, type ProviderRow} from './view';
import {intervalText} from '../shared/subscription';
import {errorText} from '../../api/error';
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
  reload: () => void;
  refresh: ReturnType<typeof useProviderRefresh>;
  refreshAll: ReturnType<typeof useRefreshAll>;
  onAdd: () => void;
  onRemove: (item: Provider) => void;
  // Edit where the declaring source takes the write, otherwise the source file to open; null when neither applies.
  editAction: (item: ProviderRow) => {kind: 'edit' | 'open'; run: () => void} | null;
};
export function useProviderTable(input: ProviderTableInput) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const {refresh} = input;
  const intervals = new Map(input.entries.map(entry => [entry.tag, entry.interval]));
  const rows = input.rows.map(item => ({
    ...providerRowView(item, item.configTag ? intervals.get(item.configTag) : undefined, locale, t),
    action: input.editAction(item),
    editLabel: t('nodes.edit', {name: item.displayName ?? item.name}),
    refreshable: item.kind === 'subscription' && input.canRefresh,
    refreshing: refresh.busy === item.id,
    refreshDisabled: !!refresh.busy,
    refresh: () =>
      void refresh.refresh(item.id).then(
        result => {
          if (!result) return;
          if ('degraded' in result) toast('info', t('nodes.refreshedDegraded', {name: item.name}));
          else toast('positive', t('nodes.refreshed', {name: item.name, n: result.node_count}));
        },
        error => toastFailure(error, t, t('nodes.refreshFailed', {name: item.name}))
      ),
    removable: input.canManage && (item.kind === 'subscription' || item.kind === 'file'),
    remove: () => {
      if (item.kind === 'subscription' || item.kind === 'file') input.onRemove(item);
    },
    setInterval: (key: string) => {
      if (!item.configTag) return;
      const seconds = Number(key);
      void input.source
        .apply(text => writeSubscriptionEntry(text, item.configTag!, {interval: seconds}))
        .then(result => {
          if (result.kind === 'ok') toast('positive', t('nodes.intervalSet', {name: item.name, interval: intervalText(seconds, locale, t)}));
          const problem = editProblem(result, t);
          if (problem) toast(problem.kind, problem.text, {detail: problem.detail, requestId: problem.requestId});
        });
    }
  }));
  return {
    rows,
    loading: input.loading,
    selected: input.selected,
    onSelect: input.onSelect,
    canManage: input.canManage,
    busy: input.busy,
    writable: input.source.writable,
    editing: rows.some(row => row.action !== null),
    sourceBusy: input.source.busy || !input.source.main,
    // An edit writes the file that declares the entry, which need not be the main source.
    editBusy: input.source.busy,
    sourceTip: input.source.error ? errorText(input.source.error, t) : undefined,
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
    updatedAt: string | null;
    expires: string;
    interval: string;
    intervalValue: string;
    hasInterval: boolean;
    intervalLabel: string;
    intervals: Array<{id: string; label: string}>;
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
    remove: () => void;
    setInterval: (key: string) => void;
  }>;
  loading: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  canManage: boolean;
  busy: boolean;
  writable: boolean;
  editing: boolean;
  sourceBusy: boolean;
  editBusy: boolean;
  sourceTip?: string;
  refreshAll: ReturnType<typeof useRefreshAll> | null;
  onAdd: () => void;
};
