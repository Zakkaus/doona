import {useT, useLang, LOCALE} from '../../i18n';
import {useMemo, useState} from 'react';
import Delete from '../../ui/icons/Delete';
import {useDnsControl, useDnsLog} from '../../api/store';
import {localTime, relativeStart} from '../../api/selectors';
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
  exportName
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import type {PageProps} from '../types';
import {FlushCacheButton} from './FlushCache';

// "How does a name resolve, and is the cache in the way": a query tab and a cache tab over the same domain.
export function Dns({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [type, setType] = useState(params.get('type') ?? 'A');
  const dns = useDnsControl();
  const resources = dns.capabilities.data?.resources;
  const types = resources?.dns_query.record_types ?? ['A', 'AAAA', 'HTTPS', 'TXT', 'MX'];
  const canQuery = resources?.dns_query.available && (type === 'all' ? types.length > 0 : types.includes(type));
  const rows = (dns.cache.data?.entries ?? []).map(entry => ({...entry, id: entry.entry_id}));
  const error = dns.error ?? dns.cache.error ?? dns.capabilities.error;
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
                  [t('ui.elapsed'), t('ui.latency', {n: result.elapsed_ms})]
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
                <span className="rp-empty">{t('dns.noAnswers')}</span>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
  const cacheFilter = (params.get('domain') ?? '').toLowerCase();
  const cacheRows = cacheFilter ? rows.filter(row => row.domain.toLowerCase().includes(cacheFilter)) : rows;
  const cacheTab = (
    <>
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
          <Button small onPress={() => setTab('cache')}>
            {t('dns.cacheFilter', {domain: params.get('domain') ?? ''})}
          </Button>
        )}
        <span className="rp-grow" />
        <FlushCacheButton
          count={dns.cache.data?.total ?? 0}
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
          {id: 'q', label: t('ui.domain'), minWidth: 192, isRowHeader: true},
          {id: 't', label: t('ui.type'), minWidth: 64, grow: 0},
          {id: 's', label: t('ui.state'), minWidth: 104, grow: 0},
          {id: 'e', label: t('dns.expires'), minWidth: 96},
          {id: 'st', label: t('dns.staleUntil'), minWidth: 104},
          {id: 'a', label: t('ui.delete'), minWidth: 56, grow: 0}
        ]}
        render={entry => [
          <TextTooltip className="rp-code" text={entry.entry_id}>
            {entry.domain}
          </TextTooltip>,
          entry.type,
          entry.status,
          <TextTooltip text={entry.expires_at}>{relativeStart(entry.expires_at, locale)}</TextTooltip>,
          <TextTooltip text={entry.stale_until ?? undefined}>{relativeStart(entry.stale_until, locale)}</TextTooltip>,
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
        ]}
      />
    </>
  );
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

// "What did the resolver do for clients": the ring newest first, narrowed by name, type and client.
// The record types the log can be narrowed to; the log has no capability of its own for this list.
const logTypes = ['A', 'AAAA', 'HTTPS', 'TXT', 'MX', 'SRV', 'PTR'];
function DnsLog({enabled, initialName}: {enabled: boolean; initialName: string}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [name, setName] = useState(initialName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('');
  const log = useDnsLog({name, type, src}, enabled);
  const rows = (log.data?.records ?? []).map(record => ({...record, id: record.id}));
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
      <DataTable
        label={t('dns.log')}
        height={520}
        rows={rows}
        loading={log.loading && !log.data}
        empty={enabled ? t('dns.logEmpty') : t('dns.logUnavailable')}
        cols={[
          {id: 't', label: t('ui.time'), minWidth: 96, grow: 0},
          {id: 'q', label: t('ui.domain'), minWidth: 200, grow: 2, isRowHeader: true},
          {id: 'ty', label: t('ui.type'), minWidth: 64, grow: 0, drop: 3},
          {id: 's', label: t('ui.source'), minWidth: 128, drop: 2},
          {id: 'r', label: t('dns.result'), minWidth: 160, grow: 2},
          {id: 'u', label: t('ui.upstream'), minWidth: 128, drop: 1},
          {id: 'e', label: t('ui.elapsed'), minWidth: 72, grow: 0, align: 'end', drop: 4}
        ]}
        render={record => [
          <TextTooltip text={localTime(record.observed_at, locale)}>{relativeStart(record.observed_at, locale)}</TextTooltip>,
          <TextTooltip>{record.question.name}</TextTooltip>,
          record.question.type,
          <TextTooltip className="rp-code">{record.src ?? '—'}</TextTooltip>,
          record.status !== 'NOERROR' ? (
            <Light small tone="err">
              {record.status}
            </Light>
          ) : (
            <TextTooltip className="rp-code">{record.answers.map(answer => answer.data).join(', ') || '—'}</TextTooltip>
          ),
          record.cached ? (
            <Light small tone="ok">
              {t('dns.hit')}
            </Light>
          ) : (
            <TextTooltip>{record.upstream ?? '—'}</TextTooltip>
          ),
          t('ui.latency', {n: record.elapsed_ms})
        ]}
      />
    </>
  );
}
