import {useMemo, useState} from 'react';
import {useCapabilities, useConnectionClose, useConnections} from '../../api/store';
import {ApiError} from '../../api/error';
import {connectionDetails, connectionRows, connectionStates, ipLiteral, sourceIp} from '../../api/selectors';
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
  useMediaQuery
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {ConnectionTable} from './ConnectionTable';
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
  const sel = q.get('id');
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    const next = q.get('q') ?? q.get('src');
    if (next !== null) setText(next);
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
      (src || !needle || [c.dst, c.domain, c.src, c.pname, c.outbound, c.chain.join(' '), c.rule_expression].join(' ').toLowerCase().includes(needle))
  );
  const cur = sel ? rows.find(c => c.id === sel) : undefined;
  const outbounds = [...new Set(rows.flatMap(c => (c.outbound ? [c.outbound] : [])))];
  const filtered = network !== 'all' || out !== 'all' || needle !== '';
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
            }}
          >
            {t('ui.clearFilters')}
          </Button>
        )}
        {resource.data?.truncated && <Badge tone="warn">{t('conn.truncated')}</Badge>}
        <span className="rp-grow" />
        <Button
          secondary
          isDisabled={!shown.length}
          onPress={() =>
            downloadFile(
              'connections-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv',
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
                    c.chain.join(' > '),
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
        />
        <DetailPanel open={!!cur} title={cur?.domain || cur?.dst || cur?.id || ''} onClose={() => select(null)}>
          {cur && (
            <>
              <Light small tone={cur.state === 'blocked' || cur.state === 'failed' ? 'err' : cur.state === 'active' ? 'ok' : 'info'}>
                {t(connectionStates[cur.state])} · {cur.network.toUpperCase()}
              </Light>
              <Kv items={connectionDetails(cur, locale).map(([key, value]) => [t(key), value])} />
              <div className="rp-cluster">
                <Button onPress={() => go('flows', cur.flow_id ? 'id=' + encodeURIComponent(cur.flow_id) : 'connection_id=' + encodeURIComponent(cur.id))}>
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
