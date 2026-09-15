import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {TextField} from '@react-spectrum/s2/TextField';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {Button} from '@react-spectrum/s2/Button';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Badge} from '@react-spectrum/s2/Badge';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Delete from '@react-spectrum/s2/icons/Delete';
import {useDnsControl} from '../../api/store';
import {relativeStart} from '../../api/selectors';
import {page, split, card, code, inline, label, row, col, h3, Kv, toast} from '../ui';
import type {PageProps} from '../Shell';

const form = style({display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap'});
export function Dns(_: PageProps) {
  const [domain, setDomain] = useState('cdn.bilibili.com');
  const [type, setType] = useState('A');
  const dns = useDnsControl();
  const resources = dns.capabilities.data?.resources;
  const types = resources?.dns_query.record_types ?? ['A', 'AAAA', 'HTTPS', 'TXT', 'MX'];
  const canQuery = resources?.dns_query.available && (type === 'all' ? types.length > 0 : types.includes(type));
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
    <div className={page}>
      {error && <p role="alert">{error.message}</p>}
      <div className={split}>
        <div className={col}>
          <div className={card}>
            <div className={form}>
              <TextField label="域名" value={domain} onChange={setDomain} styles={style({width: 280})} />
              <Picker label="類型" selectedKey={type} onSelectionChange={k => k != null && setType(String(k))}>
                {[
                  ...types.map(t => (
                    <PickerItem key={t} id={t}>
                      {t}
                    </PickerItem>
                  )),
                  <PickerItem key="all" id="all">
                    所有支援類型
                  </PickerItem>
                ]}
              </Picker>
              <Button variant="accent" isDisabled={!!dns.busy || !canQuery || !domain.trim()} onPress={() => void query()}>
                {dns.busy === 'query' ? '查詢中' : '查詢'}
              </Button>
            </div>
            {resources && !resources.dns_query.available && <span className={label}>不支援 DNS 查詢</span>}
            {dns.result && (
              <>
                <h3 className={h3}>{dns.result.domain}</h3>
                {dns.result.results.map(result => (
                  <section key={result.type} className={col}>
                    <div className={row}>
                      <h3 className={h3}>{result.type}</h3>
                      <Badge variant="neutral" size="S">
                        <Text>{result.cached ? '快取命中' : '未命中快取'}</Text>
                      </Badge>
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
                        <div key={i} className={code}>
                          {answer.name} {answer.type} · TTL {answer.ttl} s · {answer.data}
                        </div>
                      ))
                    ) : (
                      <span className={label}>沒有回答記錄</span>
                    )}
                  </section>
                ))}
              </>
            )}
          </div>
          <div className={row}>
            {dns.cache.data &&
              (['positive', 'negative', 'persistent'] as const).map(key => (
                <Badge key={key} variant="neutral" size="S">
                  <Text>
                    {{positive: '正快取', negative: '負快取', persistent: '持久快取'}[key]}：{dns.cache.data!.coverage[key] ? '涵蓋' : '不涵蓋'}
                  </Text>
                </Badge>
              ))}
          </div>
          <TableView aria-label="快取" styles={style({height: 342})}>
            <TableHeader>
              <Column id="id" width={80}>
                編號
              </Column>
              <Column id="q" isRowHeader>
                域名
              </Column>
              <Column id="t" width={70}>
                類型
              </Column>
              <Column id="s" width={100}>
                狀態
              </Column>
              <Column id="e" width={100}>
                到期時間
              </Column>
              <Column id="st" width={110}>
                過期後仍可用至
              </Column>
              <Column id="a" width={64}>
                刪除
              </Column>
            </TableHeader>
            <TableBody
              items={dns.cache.data?.entries ?? []}
              renderEmptyState={() =>
                dns.cache.loading || dns.capabilities.loading
                  ? '載入中'
                  : resources?.dns_cache.available && resources.dns_cache.read
                    ? '沒有快取記錄'
                    : '不支援快取列表'
              }
            >
              {entry => (
                <Row id={entry.entry_id}>
                  <Cell>{entry.entry_id}</Cell>
                  <Cell>
                    <span className={code}>{entry.domain}</span>
                  </Cell>
                  <Cell>{entry.type}</Cell>
                  <Cell>{entry.status}</Cell>
                  <Cell>
                    <span title={entry.expires_at}>{relativeStart(entry.expires_at)}</span>
                  </Cell>
                  <Cell>
                    <span title={entry.stale_until ?? undefined}>{relativeStart(entry.stale_until)}</span>
                  </Cell>
                  <Cell>
                    <div className={inline}>
                      <ActionButton
                        isQuiet
                        size="S"
                        aria-label={'刪除快取 ' + entry.entry_id}
                        isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.delete_entry}
                        onPress={() => void remove(entry.entry_id)}
                      >
                        <Delete />
                      </ActionButton>
                    </div>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </div>
        <div className={card}>
          <h3 className={h3}>清除快取</h3>
          <Kv
            items={[
              ['範圍', '全部'],
              ['快取記錄', dns.cache.data ? String(dns.cache.data.total) : '—']
            ]}
          />
          <Button
            variant="negative"
            fillStyle="outline"
            isDisabled={!!dns.busy || !resources?.dns_cache.available || !resources.dns_cache.flush}
            onPress={() => void flush()}
          >
            {dns.busy === 'flush' ? '清除中' : '清除全部快取'}
          </Button>
        </div>
      </div>
    </div>
  );
}
