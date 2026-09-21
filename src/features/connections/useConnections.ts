import {useMemo, useState} from 'react';
import {useCapabilities, useConnectionClose, useConnections as useConnectionResource, useOutboundNames} from '../../api/store';
import {ApiError} from '../../api/error';
import {chainNames, connectionRows, ipLiteral} from '../../api/selectors';
import {downloadFile, errorText, exportName, panelQuery, toast, useDebounced, useLinked, useMediaQuery} from '../../ui/ui';
import {within} from '../../shell/route';
import {useT, useLang, LOCALE} from '../../i18n';
import type {PageProps} from '../types';
import {columns, readView, viewKey, closeSelection, connectionsView, connectionTableView, type ConnectionView} from './view';

export function useConnections({go, query}: PageProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [view, setView] = useState(() => {
    try {
      return readView(localStorage.getItem(viewKey));
    } catch {
      return readView(null);
    }
  });
  const wide = useMediaQuery(panelQuery);
  const updateView = (patch: Partial<ConnectionView>) => {
    const next = {...view, ...patch};
    setView(next);
    try {
      localStorage.setItem(viewKey, JSON.stringify(next));
    } catch {
      /* Storage can be unavailable. */
    }
  };
  const q = useMemo(() => new URLSearchParams(query), [query]);
  const [text, setText] = useState(q.get('q') ?? q.get('src') ?? '');
  const network = q.get('network') ?? 'all';
  const out = q.get('out') ?? 'all';
  const rule = q.get('rule') ?? 'all';
  const setFilter = (key: 'network' | 'out' | 'rule', value: string) => go('connections', within(query, {[key]: value === 'all' ? null : value}));
  const sel = q.get('id');
  useLinked(q.get('q') ?? q.get('src'), value => setText(value ?? ''));
  const select = (id: string | null) => go('connections', within(query, {id}));
  const settledText = useDebounced(text, 300);
  const src = ipLiteral(settledText);
  const resource = useConnectionResource(src);
  const capabilities = useCapabilities();
  const canClose = capabilities.data?.resources.connections.can_close === true;
  const rulesListed = capabilities.data?.resources.rules.available === true;
  const names = useOutboundNames();
  const closing = useConnectionClose(resource.refetch);
  const rows = useMemo(() => connectionRows(resource.data), [resource.data]);
  const needle = (src || ipLiteral(text) ? settledText : text).trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        c =>
          (network === 'all' || c.network === network) &&
          (out === 'all' || c.outbound === out) &&
          (rule === 'all' || c.rule_expression === rule) &&
          (src ||
            !needle ||
            [c.dst, c.domain, c.src, c.pname, c.outbound, chainNames(c.chain, names).join(' '), c.rule_expression].join(' ').toLowerCase().includes(needle))
      ),
    [rows, network, out, rule, src, needle, names]
  );
  const cur = sel ? rows.find(c => c.id === sel) : undefined;
  const model = useMemo(
    () => connectionsView(rows, shown, cur, resource.data, src, rule, locale, names, t),
    [rows, shown, cur, resource.data, src, rule, locale, names, t]
  );
  const collection = useMemo(() => connectionTableView(shown, view, locale, names, rulesListed, t), [shown, view, locale, names, rulesListed, t]);
  const close = async () => {
    if (!model.detail) return;
    try {
      if (!(await closing.close(model.detail.id))) return;
      select(null);
      toast('positive', t('conn.closed', {name: model.detail.title}));
    } catch (error) {
      toast(
        'negative',
        error instanceof ApiError && error.code === 'state_conflict' ? t('conn.notClosable') : t('conn.closeFailed', {error: errorText(error)})
      );
    }
  };
  const closeAll = async () => {
    try {
      const tally = await closing.closeAll(closeSelection(shown, network, out, rule, src, needle, !!resource.data?.truncated));
      if (!tally) return;
      select(null);
      toast(tally.closed ? 'positive' : 'negative', t('conn.closedAll', {closed: tally.closed, skipped: tally.skipped}));
    } catch (error) {
      toast('negative', t('conn.closeFailed', {error: errorText(error)}));
    }
  };
  return {
    ...model,
    view,
    updateView,
    wide,
    text,
    setText,
    network,
    out,
    sel,
    select,
    collection,
    setNetwork: (value: string) => setFilter('network', value),
    setOut: (value: string) => setFilter('out', value),
    pick: (key: string | number) => {
      const id = String(key);
      if (id.startsWith('src:')) setText(src === id.slice(4) ? '' : id.slice(4));
      else if (id.startsWith('rule:')) setFilter('rule', rule === id.slice(5) ? 'all' : id.slice(5));
    },
    columns: columns.map(column => ({id: column.id, label: t(column.label)})),
    visibleColumns: columns.filter(column => !view.hidden.includes(column.id)).map(column => column.id),
    toggleColumn: (key: string | number) => {
      const id = String(key);
      const hidden = view.hidden.includes(id) ? view.hidden.filter(value => value !== id) : [...view.hidden, id];
      if (hidden.length < columns.length) updateView({hidden});
    },
    filtered: network !== 'all' || out !== 'all' || rule !== 'all' || text.trim() !== '',
    clear: () => {
      setText('');
      go('connections', within(query, {network: null, out: null, rule: null, q: null, src: null}));
    },
    error: resource.error,
    retry: resource.refetch,
    loading: resource.loading && !resource.data,
    truncated: !!resource.data?.truncated,
    canClose,
    closeAll: {
      confirmationText: model.closeConfirmation,
      disabled: !shown.length || !!closing.busy || text !== settledText,
      pending: closing.busy === 'all',
      run: () => void closeAll()
    },
    close: {pending: closing.busy === cur?.id, disabled: !!closing.busy, run: () => void close()},
    showFlow: () => {
      if (model.detail) go('rules', model.detail.flowQuery);
    },
    onlyClient: () => {
      if (model.detail?.source) setText(model.detail.source);
    },
    canExport: shown.length > 0,
    export: () => downloadFile(exportName('connections', 'csv'), model.exportContent, 'text/csv;charset=utf-8'),
    detailTitle: model.detail?.title ?? '',
    notInSnapshot: !!sel && !cur && !!resource.data
  };
}
