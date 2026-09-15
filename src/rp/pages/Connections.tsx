import {useMemo, useState} from 'react';
import {SearchField, Input, Button as RButton} from 'react-aria-components';
import Search from '@react-spectrum/s2/icons/Search';
import Close from '@react-spectrum/s2/icons/Close';
import {useConnections} from '../../api/store';
import {connectionDetails, connectionRows, connectionStates, relativeStart} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {Button, DataTable, Kv, LabeledSelect, Light, Segmented} from '../ui';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from './types';

export function Connections({go, query}: PageProps) {
  const q = new URLSearchParams(query);
  const [text, setText] = useState(q.get('q') || q.get('src') || '');
  const [network, setNetwork] = useState('all');
  const [out, setOut] = useState('all');
  const [sel, setSel] = useState<string | null>(q.get('id') || '2');
  const resource = useConnections();
  const rows = useMemo(() => connectionRows(resource.data), [resource.data]);
  const needle = text.trim().toLowerCase();
  const shown = rows.filter(c => (network === 'all' || c.network === network) && (out === 'all' || c.outbound === out) && (!needle || [c.dst, c.domain, c.src, c.pname, c.outbound].join(' ').toLowerCase().includes(needle)));
  const cur = shown.find(c => c.id === sel);
  const outbounds = [...new Set(rows.flatMap(c => c.outbound ? [c.outbound] : []))];
  return (
    <div className="rp-page">
      {resource.error && <p role="alert" className="rp-note">無法載入連線：{resource.error.message}</p>}
      {resource.loading && !resource.data && <p role="status">載入中…</p>}
      {resource.data?.truncated && <p className="rp-note">連線清單已截斷，僅顯示部分記錄。</p>}
      <div className="rp-toolbar">
        <SearchField aria-label="篩選" value={text} onChange={setText} className="rp-input" style={{width: 280}}><Search /><Input placeholder="域名、IP、來源、程序" /><RButton className="clear" aria-label="清除"><Close /></RButton></SearchField>
        <Segmented label="網路協定" value={network} onChange={setNetwork} items={[["all", '全部 ' + rows.length], ['tcp', 'TCP'], ['udp', 'UDP']]} />
        <LabeledSelect label="出站" side value={out} onChange={setOut} items={[{id: 'all', label: '所有出站'}, ...outbounds.map(id => ({id, label: id}))]} />
        <Button onPress={() => { setText(''); setNetwork('all'); setOut('all'); }}>清除篩選</Button>
      </div>
      <div className="rp-split">
        <DataTable label="連線" rows={shown} selected={sel} onSelect={setSel} empty="沒有符合的連線"
          cols={[{id: 'dst', label: '目標', isRowHeader: true}, {id: 'src', label: '來源', width: 112}, {id: 'out', label: '出站', width: 100}, {id: 'state', label: '狀態', width: 100}, {id: 'down', label: '下載', width: 88, align: 'end'}, {id: 'age', label: '開始', width: 88, align: 'end'}]}
          render={c => [c.domain || c.dst || '—', <span className="rp-code">{c.src ?? '—'}</span>, c.outbound ?? '—', connectionStates[c.state] ?? c.state, formatBytes(c.download_bytes), relativeStart(c.started_at)]} />
        {cur ? (
          <div className="rp-card">
            <h3 className="rp-h3">{cur.domain || cur.dst || cur.id}</h3>
            <Light small tone={cur.state === 'blocked' || cur.state === 'failed' ? 'err' : cur.state === 'active' ? 'ok' : 'info'}>{connectionStates[cur.state] ?? cur.state} · {cur.network.toUpperCase()}</Light>
            <Kv items={connectionDetails(cur)} />
            <Button isDisabled={!cur.flow_id} tip={cur.flow_id ? undefined : '此連線沒有可用的流程記錄'} onPress={() => cur.flow_id && go('flows', 'id=' + encodeURIComponent(cur.flow_id))}>查看流程</Button>
            <RuleDialog trigger={<Button accent>新增規則</Button>} presets={[
              ...(cur.domain ? [{label: '域名 ' + cur.domain, cond: 'domain(full: ' + cur.domain + ')'}] : []),
              ...(cur.dst ? [{label: '目標 IP', cond: 'dip(' + cur.dst.replace(/:\d+$/, '').replace(/^\[|\]$/g, '') + ')'}] : []),
              ...(cur.src ? [{label: '來源 ' + cur.src, cond: 'sip(' + cur.src + ')'}] : [])]} />
          </div>
        ) : <div className="rp-card"><span className="rp-label">選擇連線以查看詳細資料。</span></div>}
      </div>
    </div>
  );
}
