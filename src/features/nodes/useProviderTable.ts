import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Provider} from '../../api/model';
import {useProviderRefresh} from '../../api/store';
import {errorText, toast} from '../../ui/ui';
import type {MainSourceEdit} from '../config/mainSource';
import {writeInterval, type SubscriptionEntry} from './subscriptions';
import {providerRowView, intervalText, type ProviderRow} from './view';

type ProviderTableInput = {
  rows: ProviderRow[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  canManage: boolean;
  canRefresh: boolean;
  busy: boolean;
  source: MainSourceEdit;
  entries: SubscriptionEntry[];
  reload: () => void;
  onAdd: () => void;
  onRemove: (item: Provider) => void;
};
export function useProviderTable(input: ProviderTableInput) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const refresh = useProviderRefresh(input.reload);
  const intervals = new Map(input.entries.map(entry => [entry.tag, entry.interval]));
  const fail = (error: unknown) => toast('negative', errorText(error));
  const rows = input.rows.map(item => ({
    ...providerRowView(item, intervals.get(item.name), locale, t),
    refreshable: item.kind === 'subscription' && input.canRefresh,
    refreshing: refresh.busy === item.id,
    refreshDisabled: !!refresh.busy,
    refresh: () =>
      void refresh.refresh(item.id).then(result => {
        if (result) toast('positive', t('nodes.refreshed', {name: item.name, n: formatNumber(result.node_count, locale)}));
      }, fail),
    removable: input.canManage && (item.kind === 'subscription' || item.kind === 'file'),
    remove: () => {
      if (item.kind === 'subscription' || item.kind === 'file') input.onRemove(item);
    },
    setInterval: (key: string) => {
      const seconds = Number(key);
      void input.source
        .apply(
          text => writeInterval(text, item.name, seconds),
          errors => toast('negative', t('nodes.writeInvalid', {n: formatNumber(errors, locale)}))
        )
        .then(written => {
          if (written) toast('positive', t('nodes.intervalSet', {name: item.name, interval: intervalText(seconds, locale, t)}));
        }, fail);
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
    sourceBusy: input.source.busy || !input.source.main,
    sourceTip: input.source.error ? errorText(input.source.error) : undefined,
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
    updated: string;
    updatedTitle?: string;
    expires: string;
    interval: string;
    intervalValue: string;
    hasInterval: boolean;
    intervalLabel: string;
    intervals: Array<{id: string; label: string}>;
    status: string | null;
    tone: 'ok' | 'warn' | 'err';
    error?: string;
    refreshLabel: string;
    removeLabel: string;
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
  sourceBusy: boolean;
  sourceTip?: string;
  onAdd: () => void;
};
