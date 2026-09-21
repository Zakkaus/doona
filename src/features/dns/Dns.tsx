import {useT, useLang, LOCALE} from '../../i18n';
import {useMemo, useState} from 'react';
import Delete from '../../ui/icons/Delete';
import {useCapabilities, useDnsControl, useDnsLog} from '../../api/store';
import {getApi} from '../../api';
import {useAction} from '../../api/store/action';
import type {DnsQueryResponse} from '../../api/model';
import {localTime, relativeStart} from '../../api/selectors';
import {millis} from '../../api/u64';
import {
  Badge,
  Button,
  DataTable,
  ErrorMessage,
  Light,
  TextTooltip,
  Kv,
  LabeledSelect,
  Tabs,
  TextField,
  csvLine,
  downloadFile,
  errorText,
  toast,
  exportName,
  useDebounced,
  DetailPanel,
  panelQuery,
  useLinked,
  useMediaQuery,
  Empty
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import type {PageProps} from '../types';
import {FlushCacheButton} from './FlushCache';

function useDnsQuery() {
  const api = getApi();
  const capabilities = useCapabilities();
  const [result, setResult] = useState<DnsQueryResponse | null>(null);
  const {busy, error, run} = useAction<'query'>({rethrow: true});
  return {
    capabilities,
    result,
    busy,
    error,
    query: (domain: string, types: string[]) =>
      run('query', async signal => {
        const value = await api.dnsQuery(domain, types, signal);
        if (!signal.aborted) setResult(value);
        return value;
      })
  };
}

export function Dns({go, query}: PageProps) {
  const t = useT();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [type, setType] = useState(params.get('type') ?? 'A');
  useLinked(params.get('domain'), value => setDomain(value ?? ''));
  useLinked(params.get('type'), value => setType(value ?? 'A'));
  const dns = useDnsQuery();
  const resources = dns.capabilities.data?.resources;
  const types = resources?.dns_query.record_types ?? ['A', 'AAAA', 'HTTPS', 'TXT', 'MX'];
  const canQuery = resources?.dns_query.available && (type === 'all' ? types.length > 0 : types.includes(type));
  const error = dns.error ?? dns.capabilities.error;
  const setTab = (tab: string, extra?: Record<string, string>) => {
    const next = new URLSearchParams();
    next.set('tab', tab);
    for (const [key, value] of Object.entries(extra ?? {})) next.set(key, value);
    go('dns', next.toString());
  };
  async function runQuery() {
    try {
      await dns.query(domain.trim(), type === 'all' ? types : [type]);
    } catch (error) {
      toast('negative', t('dns.queryFailed', {error: errorText(error)}));
    }
  }
  const queryTab = (
    <>
      <form
        className="rp-card"
        onSubmit={e => {
          e.preventDefault();
          void runQuery();
        }}
      >
        <div className="rp-toolbar">
          <TextField side label={t('ui.domain')} value={domain} onChange={setDomain} width={280} placeholder="example.com" />
          <LabeledSelect
            label={t('ui.type')}
            side
            value={type}
            onChange={setType}
            items={[...types.map(t => ({id: t, label: t})), {id: 'all', label: t('dns.allTypes')}]}
          />
          <Button accent type="submit" isPending={dns.busy === 'query'} isDisabled={!!dns.busy || !canQuery || !domain.trim()}>
            {t('dns.query')}
          </Button>
          {resources && !resources.dns_query.available && <span className="rp-label">{t('dns.unavailable')}</span>}
        </div>
      </form>
      {dns.result && (
        <div className="rp-col">
          {dns.result.results.map(result => (
            <section key={result.type} className="rp-card rp-col">
              <div className="rp-row">
                <div className="rp-cluster">
                  <h3 className="rp-h3">
                    {dns.result?.domain} · {result.type}
                  </h3>
                  <Badge tone={result.cached ? undefined : 'warn'}>{result.cached ? t('dns.hit') : t('dns.miss')}</Badge>
                </div>
                {resources?.dns_cache.available && (
                  <Button quiet small onPress={() => setTab('cache', {domain: dns.result?.domain ?? ''})}>
                    {t('dns.viewCache')}
                  </Button>
                )}
              </div>
              <Kv
                inline
                items={[
                  [t('ui.state'), result.status],
                  [t('ui.upstream'), result.upstream ?? '—'],
                  [t('dns.routeSource'), result.route.source],
                  [t('dns.routeRule'), result.route.rule ?? '—'],
                  [t('ui.elapsed'), t('ui.latency', {n: millis(result.elapsed_ms)})]
                ]}
              />
              {result.answers?.length ? (
                <div className="rp-list">
                  {result.answers.map((answer, i) => (
                    <div key={i} className="rp-code">
                      {t('dns.answer', {name: answer.name, type: answer.type, ttl: answer.ttl, data: answer.data})}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>{t('dns.noAnswers')}</Empty>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
  const cacheTab = <DnsCache domain={params.get('domain') ?? ''} clearFilter={() => setTab('cache')} />;
  const logTab = <DnsLog enabled={resources?.dns_log.available === true} initialName={params.get('domain') ?? ''} />;
  const tabs = [
    ...(resources?.dns_query.available !== false ? [{id: 'query', label: t('dns.query'), content: queryTab}] : []),
    ...(resources?.dns_log.available !== false ? [{id: 'log', label: t('dns.log'), content: logTab}] : []),
    ...(resources?.dns_cache.available !== false ? [{id: 'cache', label: t('ui.cache'), content: cacheTab}] : [])
  ];
  const tab = tabs.some(item => item.id === params.get('tab')) ? params.get('tab')! : (tabs[0]?.id ?? 'query');
  return (
    <div className="rp-page">
      {error && <ErrorMessage error={error} />}
      <Tabs label={t('nav.dns')} items={tabs} value={tab} onChange={next => setTab(next)} />
    </div>
  );
}

function DnsCache({domain, clearFilter}: {domain: string; clearFilter: () => void}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const dns = useDnsControl();
  const resources = dns.capabilities.data?.resources;
  const rows = (dns.cache.data?.entries ?? []).map(entry => ({...entry, id: entry.entry_id}));
  const error = dns.error ?? dns.cache.error ?? dns.capabilities.error;
  async function remove(id: string) {
    try {
      const result = await dns.remove(id);
      if (result) toast('positive', t('dns.deleted', {n: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.deleteFailed', {error: errorText(error)}));
    }
  }
  async function flush() {
    try {
      const result = await dns.flush();
      if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.flushFailed', {error: errorText(error)}));
    }
  }
  const cacheFilter = domain.toLowerCase();
  const cacheRows = cacheFilter ? rows.filter(row => row.domain.toLowerCase().includes(cacheFilter)) : rows;
  return (
    <>
      {error && <ErrorMessage error={error} />}
      <div className="rp-toolbar">
        <Kv row items={[[t('dns.entries'), dns.cache.data ? String(dns.cache.data.total) : '—']]} />
        {dns.cache.data &&
          (['positive', 'negative', 'persistent'] as const)
            .filter(key => !dns.cache.data!.coverage[key])
            .map(key => (
              <Badge key={key} tone="warn">
                {t('ui.valuePair', {
                  label: {positive: t('dns.positive'), negative: t('dns.negative'), persistent: t('dns.persistent')}[key],
                  value: t('dns.notCovered')
                })}
              </Badge>
            ))}
        {cacheFilter && (
          <Button small onPress={clearFilter}>
            {t('dns.cacheFilter', {domain})}
          </Button>
        )}
        <span className="rp-grow" />
        <FlushCacheButton
          count={dns.cache.data ? dns.cache.data.total : null}
          busy={dns.busy === 'flush'}
          isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.flush}
          onFlush={() => void flush()}
        />
      </div>
      <DataTable
        label={t('ui.cache')}
        height={442}
        rows={cacheRows}
        loading={(dns.cache.loading || dns.capabilities.loading) && !dns.cache.data}
        empty={resources?.dns_cache.available && resources.dns_cache.read ? t('dns.empty') : t('dns.cacheUnavailable')}
        cols={[
          {
            id: 'q',
            label: t('ui.domain'),
            minWidth: 192,
            isRowHeader: true,
            render: entry => (
              <TextTooltip className="rp-code" text={entry.entry_id}>
                {entry.domain}
              </TextTooltip>
            )
          },
          {id: 't', label: t('ui.type'), minWidth: 64, grow: 0, render: entry => entry.type},
          {id: 's', label: t('ui.state'), minWidth: 104, grow: 0, render: entry => entry.status},
          {
            id: 'e',
            label: t('dns.expires'),
            minWidth: 96,
            render: entry => <TextTooltip text={entry.expires_at}>{relativeStart(entry.expires_at, locale)}</TextTooltip>
          },
          {
            id: 'st',
            label: t('dns.staleUntil'),
            minWidth: 104,
            render: entry => <TextTooltip text={entry.stale_until ?? undefined}>{relativeStart(entry.stale_until, locale)}</TextTooltip>
          },
          {
            id: 'a',
            label: t('ui.delete'),
            minWidth: 56,
            grow: 0,
            render: entry => (
              <Button
                quiet
                icon
                small
                label={t('dns.deleteEntry', {id: entry.entry_id})}
                isPending={dns.busy === entry.entry_id}
                isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.delete_entry}
                onPress={() => void remove(entry.entry_id)}
              >
                <Delete />
              </Button>
            )
          }
        ]}
      />
    </>
  );
}

const logTypes = ['A', 'AAAA', 'HTTPS', 'TXT', 'MX', 'SRV', 'PTR'];
function DnsLog({enabled, initialName}: {enabled: boolean; initialName: string}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [name, setName] = useState(initialName);
  useLinked(initialName, setName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('');
  // Each text filter is a server-side query, so it reaches the request only after typing pauses.
  const log = useDnsLog({name: useDebounced(name, 300), type, src: useDebounced(src, 300)}, enabled);
  const rows = (log.data?.records ?? []).map(record => ({...record, id: record.id}));
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useMediaQuery(panelQuery);
  const current = selected ? rows.find(record => record.id === selected) : undefined;
  return (
    <>
      <div className="rp-toolbar">
        <TextField search label={t('ui.domain')} value={name} onChange={setName} placeholder={t('dns.logFilterHint')} width={240} />
        <LabeledSelect
          label={t('ui.type')}
          side
          value={type}
          onChange={setType}
          items={[{id: 'all', label: t('dns.allTypes')}, ...logTypes.map(id => ({id, label: id}))]}
        />
        <TextField search label={t('ui.source')} value={src} onChange={setSrc} placeholder="10.0.0.12" width={160} />
        {log.data && <span className="rp-label">{t('dns.logTotal', {n: log.data.total})}</span>}
        <span className="rp-grow" />
        <Button
          isDisabled={!rows.length}
          onPress={() =>
            downloadFile(
              exportName('dns-log', 'csv'),
              [
                csvLine(['id', 'observed_at', 'src', 'name', 'type', 'status', 'cached', 'upstream', 'route_source', 'route_rule', 'elapsed_ms', 'answers']),
                ...rows.map(r =>
                  csvLine([
                    r.id,
                    r.observed_at,
                    r.src,
                    r.question.name,
                    r.question.type,
                    r.status,
                    r.cached ? 'true' : 'false',
                    r.upstream,
                    r.route.source,
                    r.route.rule,
                    r.elapsed_ms,
                    r.answers.map(answer => answer.data).join(' ')
                  ])
                )
              ].join('\n') + '\n',
              'text/csv;charset=utf-8'
            )
          }
        >
          <Download />
          {t('dns.exportLog')}
        </Button>
      </div>
      {log.error && <ErrorMessage error={log.error} />}
      <div className="rp-with-panel" data-open={current ? '' : undefined}>
        <DataTable
          label={t('dns.log')}
          height={520}
          rows={rows}
          selected={current ? selected : null}
          onSelect={setSelected}
          selectOnFocus={wide}
          loading={log.loading && !log.data}
          empty={enabled ? t('dns.logEmpty') : t('dns.logUnavailable')}
          cols={[
            {
              id: 't',
              label: t('ui.time'),
              minWidth: 96,
              grow: 0,
              render: record => <TextTooltip text={localTime(record.observed_at, locale)}>{relativeStart(record.observed_at, locale)}</TextTooltip>
            },
            {id: 'q', label: t('ui.domain'), minWidth: 200, grow: 2, isRowHeader: true, render: record => <TextTooltip>{record.question.name}</TextTooltip>},
            {id: 'ty', label: t('ui.type'), minWidth: 64, grow: 0, drop: 3, render: record => record.question.type},
            {id: 's', label: t('ui.source'), minWidth: 128, drop: 2, render: record => <TextTooltip className="rp-code">{record.src ?? '—'}</TextTooltip>},
            {
              id: 'r',
              label: t('dns.result'),
              minWidth: 160,
              grow: 2,
              render: record =>
                record.status !== 'NOERROR' ? (
                  <Light small tone="err">
                    {record.status}
                  </Light>
                ) : (
                  <TextTooltip className="rp-code">{record.answers.map(answer => answer.data).join(', ') || '—'}</TextTooltip>
                )
            },
            {
              id: 'u',
              label: t('ui.upstream'),
              minWidth: 128,
              drop: 1,
              render: record =>
                record.cached ? (
                  <Light small tone="ok">
                    {t('dns.hit')}
                  </Light>
                ) : (
                  <TextTooltip>{record.upstream ?? '—'}</TextTooltip>
                )
            },
            {id: 'e', label: t('ui.elapsed'), minWidth: 72, grow: 0, align: 'end', drop: 4, render: record => t('ui.latency', {n: millis(record.elapsed_ms)})}
          ]}
        />
        <DetailPanel open={!!current} title={current?.question.name ?? ''} onClose={() => setSelected(null)}>
          {current && (
            <>
              <Kv
                inline
                items={[
                  [t('ui.type'), current.question.type],
                  [t('ui.source'), current.src ?? '—'],
                  [t('ui.state'), current.status],
                  [t('ui.cache'), t(current.cached ? 'dns.hit' : 'dns.miss')],
                  [t('ui.upstream'), current.upstream ?? '—'],
                  [t('dns.routeSource'), current.route.source],
                  [t('dns.routeRule'), current.route.rule ?? '—'],
                  [t('ui.elapsed'), t('ui.latency', {n: millis(current.elapsed_ms)})],
                  [t('ui.time'), localTime(current.observed_at, locale)]
                ]}
              />
              {current.answers.length ? (
                <div className="rp-list">
                  {current.answers.map((answer, i) => (
                    <div key={i} className="rp-code">
                      {t('dns.answer', {name: answer.name, type: answer.type, ttl: answer.ttl, data: answer.data})}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>{t('dns.noAnswers')}</Empty>
              )}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
