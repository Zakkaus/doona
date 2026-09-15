import {useState} from 'react';
import Delete from '@react-spectrum/s2/icons/Delete';
import {useDnsControl} from '../../api/store';
import {relativeStart} from '../../api/selectors';
import {Badge, Button, DataTable, Kv, LabeledSelect, TextField, toast} from '../ui';

export function Dns() {
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
      toast('negative', '查詢失敗 · ' + String(error));
    }
  }
  async function remove(id: string) {
    try {
      const result = await dns.remove(id);
      if (result) toast('positive', '已刪除 ' + result.deleted + ' 筆快取');
    } catch (error) {
      toast('negative', '刪除失敗 · ' + String(error));
    }
  }
  async function flush() {
    try {
      const result = await dns.flush();
      if (result) toast('positive', '快取清除完成，符合 / 已刪除：' + result.matched + ' / ' + result.deleted);
    } catch (error) {
      toast('negative', '清除失敗 · ' + String(error));
    }
  }
  return (
    <div className="rp-page">
      {error && <p role="alert">{error.message}</p>}
      <div className="rp-split">
        <div className="rp-col">
          <div className="rp-card">
            <div className="rp-toolbar" style={{alignItems: 'flex-end'}}>
              <TextField label="域名" value={domain} onChange={setDomain} width={280} />
              <LabeledSelect
                label="類型"
                value={type}
                onChange={setType}
                items={[...types.map(t => ({id: t, label: t})), {id: 'all', label: '所有支援類型'}]}
              />
              <Button accent isDisabled={!!dns.busy || !canQuery || !domain.trim()} onPress={() => void query()}>
                {dns.busy === 'query' ? '查詢中' : '查詢'}
              </Button>
            </div>
            {resources && !resources.dns_query.available && <span className="rp-label">不支援 DNS 查詢</span>}
            {dns.result && (
              <>
                <h3 className="rp-h3">{dns.result.domain}</h3>
                {dns.result.results.map(result => (
                  <section key={result.type} className="rp-col">
                    <div className="rp-cluster">
                      <h3 className="rp-h3">{result.type}</h3>
                      <Badge>{result.cached ? '快取命中' : '未命中快取'}</Badge>
                    </div>
                    <Kv
                      items={[
                        ['狀態', result.status],
                        ['上游', result.upstream ?? '—'],
                        ['路由來源', result.route.source],
                        ['路由規則', result.route.rule ?? '—'],
                        ['耗時', result.elapsed_ms + ' ms']
                      ]}
                    />
                    {result.answers?.length ? (
                      result.answers.map((answer, i) => (
                        <div key={i} className="rp-code">
                          {answer.name} {answer.type} · TTL {answer.ttl} s · {answer.data}
                        </div>
                      ))
                    ) : (
                      <span className="rp-label">沒有回答記錄</span>
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
                  {{positive: '正快取', negative: '負快取', persistent: '持久快取'}[key]}：{dns.cache.data!.coverage[key] ? '涵蓋' : '不涵蓋'}
                </Badge>
              ))}
          </div>
          <DataTable
            label="快取"
            height={342}
            rows={rows}
            empty={
              dns.cache.loading || dns.capabilities.loading
                ? '載入中'
                : resources?.dns_cache.available && resources.dns_cache.read
                  ? '沒有快取記錄'
                  : '不支援快取列表'
            }
            cols={[
              {id: 'id', label: '編號', width: 80},
              {id: 'q', label: '域名', isRowHeader: true},
              {id: 't', label: '類型', width: 70},
              {id: 's', label: '狀態', width: 100},
              {id: 'e', label: '到期時間', width: 100},
              {id: 'st', label: '過期後仍可用至', width: 110},
              {id: 'a', label: '刪除', width: 64}
            ]}
            render={entry => [
              entry.entry_id,
              <span className="rp-code">{entry.domain}</span>,
              entry.type,
              entry.status,
              <span title={entry.expires_at}>{relativeStart(entry.expires_at)}</span>,
              <span title={entry.stale_until ?? undefined}>{relativeStart(entry.stale_until)}</span>,
              <Button
                quiet
                icon
                small
                label={'刪除快取 ' + entry.entry_id}
                isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.delete_entry}
                onPress={() => void remove(entry.entry_id)}
              >
                <Delete />
              </Button>
            ]}
          />
        </div>
        <div className="rp-card">
          <h3 className="rp-h3">清除快取</h3>
          <Kv
            items={[
              ['範圍', '全部'],
              ['快取記錄', dns.cache.data ? String(dns.cache.data.total) : '—']
            ]}
          />
          <Button negative isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.flush} onPress={() => void flush()}>
            {dns.busy === 'flush' ? '清除中' : '清除全部快取'}
          </Button>
        </div>
      </div>
    </div>
  );
}
