import {useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import {useCapabilities, useConnectionClose, useConnections, useOutboundNames} from '../../store';
import {ApiError, errorText} from '../../api/error';
import {chainNames, closedAllTone, connectionRows, ipLiteral, outboundLabel} from '../../api/selectors';
import {downloadFile, exportName, panelQuery, toast, useLinked, useMediaQuery} from '../../ui/ui';
import {pickTab, tabQuery, within} from '../../shell/route';
import {useT, useLang, LOCALE} from '../../i18n';
import type {PageProps} from '../../shell/routes';
import {
  columns,
  readView,
  viewKey,
  closeSelection,
  connectionsExport,
  connectionsView,
  connectionTableView,
  type CloseSelection,
  type ConnectionView
} from './view';
import {offered} from '../../api/capabilities';

const connectionTabs = ['traffic', 'list'] as const;
// The traffic chart comes first; a link into the table (a connection, a source, a filter) opens the table.
const connectionsFallback = (query: string) =>
  ['id', 'src', 'network', 'out', 'rule', 'q'].some(key => new URLSearchParams(query).has(key)) ? 'list' : 'traffic';
// While the link decides the tab, a change within the page writes it, so clearing the filter or selection that opened
// the table keeps the table.
const stay = (query: string, patch: Record<string, string | null>) =>
  within(query, connectionsFallback(query) === 'list' ? {tab: pickTab(query, connectionTabs, 'list'), ...patch} : patch);

export function useConnectionsPage({go, query}: PageProps) {
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
  const [text, setText] = useState(q.get('q') ?? '');
  const network = q.get('network') ?? 'all';
  const out = q.get('out') ?? 'all';
  const rule = q.get('rule') ?? 'all';
  const setFilter = (key: 'network' | 'out' | 'rule', value: string) => go('connections', stay(query, {[key]: value === 'all' ? null : value}));
  const sel = q.get('id');
  const [confirmed, setConfirmed] = useState<CloseSelection | null>(null);
  useLinked(q.get('q'), value => setText(value ?? ''));
  // A close resolves after the person may have changed the filters; navigating from the query captured when it
  // started would put the old ones back.
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  });
  const select = (id: string | null) => go('connections', stay(latest.current, {id}));
  // Filtering follows typing at React's pace, not a fixed delay, so an export or close right after typing sees the new list.
  const settledText = useDeferredValue(text);
  const src = ipLiteral(q.get('src') ?? '');
  const resource = useConnections(src);
  const capabilities = useCapabilities();
  const canClose = capabilities.data?.resources.connections.can_close === true;
  const rulesListed = offered(capabilities.data?.resources, 'rules', {whileLoading: false});
  const canViewFlow = offered(capabilities.data?.resources, 'flows', {whileLoading: false});
  const names = useOutboundNames();
  const closing = useConnectionClose(resource.refetch);
  const rows = useMemo(() => connectionRows(resource.data), [resource.data]);
  const outboundKeys = useMemo(() => [...new Set(rows.map(row => row.outbound))].sort((a, b) => (a ?? '').localeCompare(b ?? '')), [rows]);
  const needle = settledText.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        c =>
          (network === 'all' || c.network === network) &&
          (out === 'all' || c.outbound === out) &&
          (rule === 'all' || c.rule_expression === rule) &&
          (!needle ||
            [c.dst, c.domain, c.src, c.pname, outboundLabel(c.outbound, t), chainNames(c.chain, names).join(' '), c.rule_expression]
              .join(' ')
              .toLowerCase()
              .includes(needle))
      ),
    [rows, network, out, rule, needle, names, t]
  );
  const cur = sel ? rows.find(c => c.id === sel) : undefined;
  const model = useMemo(
    () => connectionsView(rows, cur, resource.data, src, rule, locale, t, names, rulesListed),
    [rows, cur, resource.data, src, rule, locale, t, names, rulesListed]
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
        error instanceof ApiError && error.code === 'state_conflict' ? t('conn.notClosable') : t('conn.closeFailed', {error: errorText(error, t)})
      );
    }
  };
  const closeAll = async () => {
    if (!confirmed) return;
    try {
      const tally = await closing.closeAll(confirmed);
      if (!tally) return;
      select(null);
      toast(closedAllTone(tally), t('conn.closedAll', {closed: tally.closed, skipped: tally.skipped}));
    } catch (error) {
      return t('conn.closeFailed', {error: errorText(error, t)});
    }
  };
  const fallback = connectionsFallback(query);
  const openInList = useCallback((id: string) => go('connections', within(query, {tab: 'list', id})), [go, query]);
  return {
    ...model,
    tab: pickTab(query, connectionTabs, fallback),
    setTab: (next: string) => go('connections', tabQuery(query, next, fallback === 'traffic' ? fallback : null)),
    openInList,
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
    // Every connection in the snapshot for the traffic chart, which has no filters of its own, and every outbound for
    // its colours.
    rows,
    outboundKeys,
    setNetwork: (value: string) => setFilter('network', value),
    setOut: (value: string) => setFilter('out', value),
    pick: (key: string | number) => {
      const id = String(key);
      if (id.startsWith('src:')) {
        setText('');
        go('connections', stay(query, {src: src === id.slice(4) ? null : id.slice(4), q: null}));
      } else if (id.startsWith('rule:')) setFilter('rule', rule === id.slice(5) ? 'all' : id.slice(5));
    },
    columns: columns.map(column => ({id: column.id, label: t(column.label)})),
    visibleColumns: columns.filter(column => !view.hidden.includes(column.id)).map(column => column.id),
    toggleColumn: (key: string | number) => {
      const id = String(key);
      const hidden = view.hidden.includes(id) ? view.hidden.filter(value => value !== id) : [...view.hidden, id];
      if (hidden.length < columns.length) updateView({hidden});
    },
    filtered: network !== 'all' || out !== 'all' || rule !== 'all' || !!src || text.trim() !== '',
    clear: () => {
      setText('');
      go('connections', stay(query, {network: null, out: null, rule: null, q: null, src: null}));
    },
    error: resource.error,
    retry: resource.refetch,
    loading: resource.loading && !resource.data,
    truncated: !!resource.data?.truncated,
    canClose,
    canViewFlow,
    closeAll: {
      confirmationText: confirmed?.query
        ? t(
            confirmed.query.type === 'all' ? 'conn.closeAllLive' : confirmed.query.type === 'tcp' ? 'conn.closeAllLiveTcp' : 'conn.closeAllLiveUdp',
            src ? {n: confirmed.ids.length, src} : {n: confirmed.ids.length, src: t('conn.anySource')}
          )
        : t('conn.closeAllHelp', {n: confirmed?.ids.length ?? 0}),
      open: !!confirmed,
      setOpen: (open: boolean) =>
        setConfirmed(
          open
            ? closeSelection(shown, {
                network,
                src,
                narrowed: out !== 'all' || rule !== 'all' || !!needle,
                truncated: !!resource.data?.truncated,
                bulkLimit: capabilities.data?.resources.connections.max_bulk_close
              })
            : null
        ),
      isDisabled: !shown.length || !!closing.busy || text !== settledText,
      isPending: closing.busy === 'all',
      onConfirm: closeAll
    },
    close: {pending: closing.busy === cur?.id, disabled: !!closing.busy, run: () => void close()},
    showFlow: () => {
      if (model.detail && canViewFlow) go('rules', model.detail.flowQuery);
    },
    onlyClient: () => {
      if (model.detail?.source) {
        setText('');
        go('connections', stay(query, {src: model.detail.source, q: null}));
      }
    },
    canExport: shown.length > 0,
    export: () => downloadFile(exportName('connections', 'csv'), connectionsExport(shown, names), 'text/csv;charset=utf-8'),
    detailTitle: model.detail?.title ?? '',
    notInSnapshot: !!sel && !cur && !!resource.data
  };
}
