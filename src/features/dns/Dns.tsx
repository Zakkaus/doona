import {useT, useLang, LOCALE} from '../../i18n';
import {useState} from 'react';
import Delete from '../../ui/icons/Delete';
import {useDnsControl} from '../../api/store';
import {relativeStart} from '../../api/selectors';
import {Badge, Button, DataTable, Kv, LabeledSelect, TextField, toast} from '../../ui/ui';

export function Dns() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const [domain, setDomain] = useState('cdn.bilibili.com');
  const [type, setType] = useState('A');
  const dns = useDnsControl();
  const resources = dns.capabilities.data?.resources;
  const types = resources?.dns_query.record_types ?? ['A', 'AAAA', 'HTTPS', 'TXT', 'MX'];
  const canQuery = resources?.dns_query.available && (type === 'all' ? types.length > 0 : types.includes(type));
  const rows = (dns.cache.data?.entries ?? []).map(entry => ({...entry, id: entry.entry_id}));
  const error = dns.error ?? dns.cache.error ?? dns.capabilities.error;
  async function query() {
    try {
      await dns.query(domain.trim(), type === 'all' ? types : [type]);
    } catch (error) {
      toast('negative', t('dns.queryFailed', {error: String(error)}));
    }
  }
  async function remove(id: string) {
    try {
      const result = await dns.remove(id);
      if (result) toast('positive', t('dns.deleted', {n: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.deleteFailed', {error: String(error)}));
    }
  }
  async function flush() {
    try {
      const result = await dns.flush();
      if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.flushFailed', {error: String(error)}));
    }
  }
  return (
    <div className="rp-page">
      {error && <p role="alert">{error.message}</p>}
      <div className="rp-card">
        <div className="rp-toolbar">
          <TextField side label={t('ui.domain')} value={domain} onChange={setDomain} width={280} />
          <LabeledSelect
            label={t('ui.type')}
            side
            value={type}
            onChange={setType}
            items={[...types.map(t => ({id: t, label: t})), {id: 'all', label: t('dns.allTypes')}]}
          />
          <Button accent isDisabled={!!dns.busy || !canQuery || !domain.trim()} onPress={() => void query()}>
            {dns.busy === 'query' ? t('dns.querying') : t('dns.query')}
          </Button>
        </div>
        {resources && !resources.dns_query.available && <span className="rp-label">{t('dns.unavailable')}</span>}
        {dns.result && (
          <>
            <h3 className="rp-h3">{dns.result.domain}</h3>
            {dns.result.results.map(result => (
              <section key={result.type} className="rp-col">
                <div className="rp-cluster">
                  <h3 className="rp-h3">{result.type}</h3>
                  <Badge>{result.cached ? t('dns.hit') : t('dns.miss')}</Badge>
                </div>
                <Kv
                  items={[
                    [t('ui.state'), result.status],
                    [t('ui.upstream'), result.upstream ?? '—'],
                    [t('dns.routeSource'), result.route.source],
                    [t('dns.routeRule'), result.route.rule ?? '—'],
                    [t('ui.elapsed'), t('ui.latency', {n: result.elapsed_ms})]
                  ]}
                />
                {result.answers?.length ? (
                  result.answers.map((answer, i) => (
                    <div key={i} className="rp-code">
                      {t('dns.answer', {name: answer.name, type: answer.type, ttl: answer.ttl, data: answer.data})}
                    </div>
                  ))
                ) : (
                  <span className="rp-label">{t('dns.noAnswers')}</span>
                )}
              </section>
            ))}
          </>
        )}
      </div>
      <div className="rp-cluster">
        {dns.cache.data &&
          (['positive', 'negative', 'persistent'] as const).map(key => (
            <Badge key={key}>
              {t('ui.valuePair', {
                label: {positive: t('dns.positive'), negative: t('dns.negative'), persistent: t('dns.persistent')}[key],
                value: dns.cache.data!.coverage[key] ? t('dns.covered') : t('dns.notCovered')
              })}
            </Badge>
          ))}
      </div>
      <div className="rp-toolbar rp-between">
        <Kv
          inline
          items={[
            [t('dns.scope'), t('ui.all')],
            [t('dns.entries'), dns.cache.data ? String(dns.cache.data.total) : '—']
          ]}
        />
        <Button negative isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.flush} onPress={() => void flush()}>
          {dns.busy === 'flush' ? t('dns.flushing') : t('dns.flushAll')}
        </Button>
      </div>
      <DataTable
        label={t('ui.cache')}
        height={342}
        rows={rows}
        empty={
          dns.cache.loading || dns.capabilities.loading
            ? t('ui.loading')
            : resources?.dns_cache.available && resources.dns_cache.read
              ? t('dns.empty')
              : t('dns.cacheUnavailable')
        }
        cols={[
          {id: 'id', label: t('dns.id'), minWidth: 56, grow: 0},
          {id: 'q', label: t('ui.domain'), minWidth: 192, isRowHeader: true},
          {id: 't', label: t('ui.type'), minWidth: 64, grow: 0},
          {id: 's', label: t('ui.state'), minWidth: 104, grow: 0},
          {id: 'e', label: t('dns.expires'), minWidth: 96},
          {id: 'st', label: t('dns.staleUntil'), minWidth: 104},
          {id: 'a', label: t('ui.delete'), minWidth: 56, grow: 0}
        ]}
        render={entry => [
          entry.entry_id,
          <span className="rp-code">{entry.domain}</span>,
          entry.type,
          entry.status,
          <span title={entry.expires_at}>{relativeStart(entry.expires_at, locale)}</span>,
          <span title={entry.stale_until ?? undefined}>{relativeStart(entry.stale_until, locale)}</span>,
          <Button
            quiet
            icon
            small
            label={t('dns.deleteEntry', {id: entry.entry_id})}
            isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.delete_entry}
            onPress={() => void remove(entry.entry_id)}
          >
            <Delete />
          </Button>
        ]}
      />
    </div>
  );
}
