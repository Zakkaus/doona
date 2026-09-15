import {useMemo, useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {SearchField} from '@react-spectrum/s2/SearchField';
import {Button} from '@react-spectrum/s2/Button';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key, Selection} from '@react-spectrum/s2';
import {useConnections} from '../../api/store';
import {chainLabel, connectionDetails, connectionRows, connectionStates, ipLiteral, relativeStart} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {page, card, code, label, h3, toolbar, Kv, note} from '../ui';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from '../Shell';
import {useT} from '../i18n';

const provenance = style({font: 'detail', backgroundColor: 'gray-200', borderRadius: 'sm', paddingX: 4, flexShrink: 0});
const ruleCell = style({display: 'flex', alignItems: 'center', gap: 4, minWidth: 0});
const ruleText = style({overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0});

export function Connections({go, query}: PageProps) {
  const t = useT();
  const q = new URLSearchParams(query);
  const [text, setText] = useState(q.get('q') || q.get('src') || '');
  const [network, setNetwork] = useState<Key>('all');
  const [out, setOut] = useState<Key>('all');
  const [sel, setSel] = useState<Selection>(new Set<Key>([q.get('id') || '2']));
  const src = ipLiteral(text);
  const resource = useConnections(src);
  const rows = useMemo(() => connectionRows(resource.data), [resource.data]);
  const needle = text.trim().toLowerCase();
  const shown = rows.filter(c => (network === 'all' || c.network === network) && (out === 'all' || c.outbound === out) && (src || !needle || [c.dst, c.domain, c.src, c.pname, c.outbound, c.chain.join(' '), c.rule_expression].join(' ').toLowerCase().includes(needle)));
  const cur = shown.find(c => sel !== 'all' && sel.has(c.id));
  const outbounds = [...new Set(rows.flatMap(c => c.outbound ? [c.outbound] : []))];
  return (
    <div className={page}>
      {resource.error && <p role="alert" className={note}>無法載入連線：{resource.error.message}</p>}
      {resource.loading && !resource.data && <p role="status">載入中…</p>}
      {resource.data?.truncated && <p className={note}>連線清單已截斷，僅顯示部分記錄。</p>}
      <div className={toolbar}>
        <SearchField aria-label="篩選" placeholder="域名、IP、來源、程序" value={text} onChange={setText} styles={style({width: 280})} />
        <SegmentedControl aria-label="網路協定" selectedKey={network} onSelectionChange={setNetwork}><SegmentedControlItem id="all">全部 {rows.length}</SegmentedControlItem><SegmentedControlItem id="tcp">TCP</SegmentedControlItem><SegmentedControlItem id="udp">UDP</SegmentedControlItem></SegmentedControl>
        <Picker aria-label="出站" selectedKey={out} onSelectionChange={k => k != null && setOut(k)}><PickerItem id="all">所有出站</PickerItem>{outbounds.map(id => <PickerItem key={id} id={id}>{id}</PickerItem>)}</Picker>
        <ActionButton onPress={() => { setText(''); setNetwork('all'); setOut('all'); }}><Text>清除篩選</Text></ActionButton>
      </div>
      <div className={page}>
        <TableView aria-label="連線" selectionMode="single" selectedKeys={sel} onSelectionChange={setSel} styles={style({height: 442})}>
          <TableHeader>
            <Column id="dst" isRowHeader minWidth={132}>目標</Column><Column id="src" width={136}>來源</Column><Column id="chain" minWidth={132}>{t('conn.chain')}</Column><Column id="rule" minWidth={160}>{t('conn.rule')}</Column><Column id="state" width={96}>狀態</Column><Column id="down" width={104}>下載</Column><Column id="age" width={112}>開始</Column>
          </TableHeader>
          <TableBody items={shown} renderEmptyState={() => '沒有符合的連線'}>
            {c => <Row id={c.id}><Cell textValue={c.domain || c.dst || '—'}>{c.domain || c.dst || '—'}</Cell><Cell><span className={code}>{c.src ?? '—'}</span></Cell><Cell>{chainLabel(c)}</Cell><Cell textValue={c.rule_expression ?? '—'}><span className={ruleCell}><span className={ruleText} title={c.rule_expression ?? undefined}>{c.rule_expression ?? '—'}</span>{c.rule_source === 'recomputed' ? <small className={provenance}>{t('conn.recomputed')}</small> : c.rule_source === 'unknown' ? <small className={provenance}>—</small> : null}</span></Cell><Cell>{connectionStates[c.state] ?? c.state}</Cell><Cell>{formatBytes(c.download_bytes)}</Cell><Cell>{relativeStart(c.started_at)}</Cell></Row>}
          </TableBody>
        </TableView>
        {cur ? (
          <div className={card}>
            <h3 className={h3}>{cur.domain || cur.dst || cur.id}</h3>
            <StatusLight variant={cur.state === 'blocked' || cur.state === 'failed' ? 'negative' : cur.state === 'active' ? 'positive' : 'informative'} size="S"><Text>{connectionStates[cur.state] ?? cur.state} · {cur.network.toUpperCase()}</Text></StatusLight>
            <Kv items={connectionDetails(cur)} />
            <Button variant="secondary" onPress={() => go('flows', cur.flow_id ? 'id=' + encodeURIComponent(cur.flow_id) : 'connection_id=' + encodeURIComponent(cur.id))}>查看流程</Button>
            <RuleDialog trigger={<Button variant="accent">新增規則</Button>} presets={[
              ...(cur.domain ? [{label: '域名 ' + cur.domain, cond: 'domain(full: ' + cur.domain + ')'}] : []),
              ...(cur.dst ? [{label: '目標 IP', cond: 'dip(' + cur.dst.replace(/:\d+$/, '').replace(/^\[|\]$/g, '') + ')'}] : []),
              ...(cur.src ? [{label: '來源 ' + cur.src, cond: 'sip(' + cur.src + ')'}] : [])]} />
          </div>
        ) : <div className={card}><span className={label}>選擇連線以查看詳細資料。</span></div>}
      </div>
    </div>
  );
}
