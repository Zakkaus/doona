import {useMemo, useState} from 'react';
import {useCapabilities, useConnectionClose, useConnections, useOutboundNames} from '../../api/store';
import {ApiError} from '../../api/error';
import {chainNames, connectionDetails, connectionRows, connectionStates, ipLiteral, sourceIp} from '../../api/selectors';
import {
  Badge,
  Button,
  DetailPanel,
  Kv,
  LabeledSelect,
  Light,
  MenuButton,
  Segmented,
  TextField,
  ErrorMessage,
  csvLine,
  downloadFile,
  errorText,
  panelQuery,
  toast,
  useMediaQuery,
  exportName,
  TextTooltip
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {ConnectionTable} from './ConnectionTable';
import {CloseAllButton} from './CloseAll';
import type {PageProps} from '../types';
import {useT, useLang, LOCALE} from '../../i18n';
import {columns, readView, viewKey, type ConnectionView} from './view';

// One page for "who is connected to what right now": the table groups by client by default,
// the selected row opens beside the table and is remembered in the URL.
export function Connections({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const [view, setView] = useState(readView);
  const wide = useMediaQuery(panelQuery);
  const updateView = (patch: Partial<ConnectionView>) => {
    const next = {...view, ...patch};
    setView(next);
    try {
      localStorage.setItem(viewKey, JSON.stringify(next));
    } catch {
      // Keep the controls usable when storage is unavailable.
    }
  };
  const q = useMemo(() => new URLSearchParams(query), [query]);
  const [text, setText] = useState(q.get('q') ?? q.get('src') ?? '');
  const [network, setNetwork] = useState('all');
  const [out, setOut] = useState('all');
  const [rule, setRule] = useState('all');
  const sel = q.get('id');
  // A filter arriving in the URL (a search hit, a client link) replaces the typed one; selecting a row keeps
  // the same q/src and must not reset what the person typed since.
  const linked = q.get('q') ?? q.get('src');
  const [lastLinked, setLastLinked] = useState(linked);
  if (lastLinked !== linked) {
    setLastLinked(linked);
    if (linked !== null) setText(linked);
  }
  const select = (id: string | null) => {
    const params = new URLSearchParams(query);
    if (id) params.set('id', id);
    else params.delete('id');
    go('connections', params.toString());
  };
  const src = ipLiteral(text);
  const resource = useConnections(src);
  const canClose = useCapabilities().data?.resources.connections.can_close === true;
  const names = useOutboundNames();
  const closing = useConnectionClose(resource.refetch);
  async function close(id: string, name: string) {
    try {
      await closing.close(id);
      select(null);
      toast('positive', t('conn.closed', {name}));
    } catch (error) {
      toast(
        'negative',
        error instanceof ApiError && error.code === 'state_conflict' ? t('conn.notClosable') : t('conn.closeFailed', {error: errorText(error)})
      );
    }
  }
  const rows = useMemo(() => connectionRows(resource.data), [resource.data]);
  const needle = text.trim().toLowerCase();
  const shown = rows.filter(
    c =>
      (network === 'all' || c.network === network) &&
      (out === 'all' || c.outbound === out) &&
      (rule === 'all' || c.rule_expression === rule) &&
      (src ||
        !needle ||
        [c.dst, c.domain, c.src, c.pname, c.outbound, chainNames(c.chain, names).join(' '), c.rule_expression].join(' ').toLowerCase().includes(needle))
  );
  const cur = sel ? rows.find(c => c.id === sel) : undefined;
  const outbounds = [...new Set(rows.flatMap(c => (c.outbound ? [c.outbound] : [])))];
  // The lazy filter: pick a client or a rule from what is on the table now, busiest first.
  const seen = (values: Array<string | null | undefined>) => {
    const counts = new Map<string, number>();
    for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  const clients = seen(rows.map(c => sourceIp(c.src)));
  const rules = seen(rows.map(c => c.rule_expression));
  const filtered = network !== 'all' || out !== 'all' || rule !== 'all' || needle !== '';
  return (
    <div className="rp-page">
      {resource.error && <ErrorMessage error={resource.error} />}
      <div className="rp-toolbar">
        <TextField search label={t('ui.filter')} value={text} onChange={setText} placeholder={t('conn.filterHint')} width={260} />
        <Segmented
          label={t('ui.network')}
          value={network}
          onChange={setNetwork}
          items={[
            ['all', t('ui.allCount', {n: rows.length})],
            ['tcp', t('ui.tcp')],
            ['udp', t('ui.udp')]
          ]}
        />
        <LabeledSelect
          label={t('ui.outbound')}
          side
          value={out}
          onChange={setOut}
          items={[{id: 'all', label: t('conn.allOutbounds')}, ...outbounds.map(id => ({id, label: id}))]}
        />
        <MenuButton
          quiet
          label={t('conn.pick')}
          value={[src ? 'src:' + src : '', rule !== 'all' ? 'rule:' + rule : '']}
          onChange={id => {
            if (id.startsWith('src:')) setText(src === id.slice(4) ? '' : id.slice(4));
            else if (id.startsWith('rule:')) setRule(rule === id.slice(5) ? 'all' : id.slice(5));
          }}
          sections={[
            {title: t('ui.source'), items: clients.map(([ip, n]) => ({id: 'src:' + ip, label: ip, desc: String(n)}))},
            {title: t('conn.rule'), items: rules.map(([expression, n]) => ({id: 'rule:' + expression, label: expression, desc: String(n)}))}
          ]}
        >
          {t('conn.pick')}
        </MenuButton>
        <LabeledSelect
          label={t('conn.group')}
          side
          value={view.group}
          onChange={group => updateView({group: group as ConnectionView['group']})}
          items={[
            {id: 'source', label: t('conn.byClient')},
            {id: 'outbound', label: t('ui.outbound')},
            {id: 'none', label: t('conn.ungrouped')}
          ]}
        />
        <MenuButton
          label={t('conn.columns')}
          multiple
          value={columns.filter(column => !view.hidden.includes(column.id)).map(column => column.id)}
          items={columns.map(column => ({id: column.id, label: t(column.label)}))}
          onChange={id => {
            const hidden = view.hidden.includes(id) ? view.hidden.filter(value => value !== id) : [...view.hidden, id];
            if (hidden.length < columns.length) updateView({hidden});
          }}
        >
          {t('conn.columns')}
        </MenuButton>
        {filtered && (
          <Button
            quiet
            onPress={() => {
              setText('');
              setNetwork('all');
              setOut('all');
              setRule('all');
            }}
          >
            {t('ui.clearFilters')}
          </Button>
        )}
        {resource.data?.truncated && <Badge tone="warn">{t('conn.truncated')}</Badge>}
        {resource.data && resource.data.visibility !== 'full' && (
          <TextTooltip text={t('conn.visibilityNote')}>
            <Badge>{t(resource.data.visibility === 'none' ? 'conn.visibilityNone' : 'conn.visibilityPartial')}</Badge>
          </TextTooltip>
        )}
        <span className="rp-grow" />
        {canClose && (
          <CloseAllButton
            count={shown.length}
            // Network and source-IP filters are the bulk endpoint's own; a text or outbound filter is not. A
            // truncated snapshot lists fewer rows than match, so it closes the listed ones only.
            selection={
              out === 'all' && (src || !needle) && !resource.data?.truncated
                ? {query: {type: network as 'all' | 'tcp' | 'udp', src: src ?? undefined, all: true}}
                : {ids: shown.map(c => c.id)}
            }
            closing={closing}
            onStart={() => select(null)}
          />
        )}
        <Button
          isDisabled={!shown.length}
          onPress={() =>
            downloadFile(
              exportName('connections', 'csv'),
              [
                csvLine(['id', 'target', 'domain', 'source', 'network', 'state', 'outbound', 'chain', 'rule', 'upload_bytes', 'download_bytes', 'started_at']),
                ...shown.map(c =>
                  csvLine([
                    c.id,
                    c.dst,
                    c.domain,
                    c.src,
                    c.network,
                    c.state,
                    c.outbound,
                    chainNames(c.chain, names).join(' > '),
                    c.rule_expression,
                    c.upload_bytes,
                    c.download_bytes,
                    c.started_at
                  ])
                )
              ].join('\n') + '\n',
              'text/csv;charset=utf-8'
            )
          }
        >
          <Download />
          {t('conn.export')}
        </Button>
      </div>
      <div className="rp-with-panel" data-open={cur ? '' : undefined}>
        <ConnectionTable
          rows={shown}
          loading={resource.loading && !resource.data}
          selected={sel}
          onSelect={select}
          selectOnFocus={wide}
          view={view}
          onSort={sort => updateView({sort})}
          names={names}
        />
        <DetailPanel open={!!cur} title={cur?.domain || cur?.dst || cur?.id || ''} onClose={() => select(null)}>
          {cur && (
            <>
              <Light small tone={cur.state === 'blocked' || cur.state === 'failed' ? 'err' : cur.state === 'active' ? 'ok' : 'info'}>
                {t(connectionStates[cur.state])} · {cur.network.toUpperCase()}
              </Light>
              <Kv items={connectionDetails(cur, locale).map(([key, value]) => [t(key), typeof value === 'string' ? value : t(value.key, value.params)])} />
              <div className="rp-cluster">
                <Button
                  onPress={() =>
                    go('rules', 'tab=flows&' + (cur.flow_id ? 'id=' + encodeURIComponent(cur.flow_id) : 'connection_id=' + encodeURIComponent(cur.id)))
                  }
                >
                  {t('conn.viewFlow')}
                </Button>
                {cur.src && (
                  <Button quiet onPress={() => setText(sourceIp(cur.src) ?? cur.src ?? '')}>
                    {t('conn.onlyThisClient')}
                  </Button>
                )}
                {canClose && (cur.state === 'active' || cur.state === 'dialing' || cur.state === 'routing') && (
                  <>
                    <span className="rp-grow" />
                    <Button
                      negative
                      quiet
                      isPending={closing.busy === cur.id}
                      isDisabled={!!closing.busy}
                      onPress={() => void close(cur.id, cur.domain || cur.dst || cur.id)}
                    >
                      {t('conn.close')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DetailPanel>
      </div>
      {sel && !cur && resource.data && <span className="rp-label">{t('conn.notInSnapshot')}</span>}
    </div>
  );
}
