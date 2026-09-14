import {useState} from 'react';
import Delete from '@react-spectrum/s2/icons/Delete';
import {dnsCache} from '../../app/mock';
import {Button, DataTable, Kv, LabeledSelect, TextField, toast} from '../ui';
import type {PageProps} from './types';

export function Dns(_: PageProps) {
  const [qname, setQname] = useState('cdn.bilibili.com');
  const [qtype, setQtype] = useState('A');
  const [asked, setAsked] = useState<{qname: string, qtype: string} | null>({qname: 'cdn.bilibili.com', qtype: 'A'});
  const [scope, setScope] = useState('all');
  return (
    <div className="rp-page">
      <div className="rp-split">
        <div className="rp-col">
          <div className="rp-card">
            <div className="rp-toolbar" style={{alignItems: 'flex-end'}}>
              <TextField label="qname" value={qname} onChange={setQname} width={280} />
              <LabeledSelect label="qtype" value={qtype} onChange={setQtype} items={['A', 'AAAA', 'HTTPS', 'TXT', 'MX'].map(t => ({id: t, label: t}))} />
              <Button accent onPress={() => setAsked({qname, qtype})}>查詢</Button>
            </div>
            {asked && (<>
              <h3 className="rp-h3">{asked.qname} {asked.qtype}</h3>
              <Kv items={[['狀態', 'NOERROR，1 筆'], ['路由', 'qname(geosite: cn) -> alidns'], ['上游', 'udp://223.5.5.5'], ['快取', '命中，剩 58 秒'], ['回應', '120.92.78.14'], ['時序', '路由 0.1 ms，上游 8.4 ms，回應 0.3 ms']]} />
            </>)}
          </div>
          <DataTable label="快取" height={292} rows={dnsCache}
            cols={[{id: 'q', label: 'qname', isRowHeader: true}, {id: 't', label: 'qtype', width: 88}, {id: 'k', label: '正負', width: 80}, {id: 'u', label: '上游', width: 170}, {id: 'e', label: '過期', width: 100}, {id: 'a', label: '刪除', width: 64}]}
            render={c => [<span className="rp-code">{c.qname}</span>, c.qtype, c.kind, c.upstream, c.expires, <Button quiet icon small label="刪這條快取" onPress={() => toast('positive', '已刪 ' + c.qname + ' ' + c.qtype)}><Delete /></Button>]} />
        </div>
        <div className="rp-card">
          <h3 className="rp-h3">flush</h3>
          <LabeledSelect label="範圍" value={scope} onChange={setScope} items={[{id: 'all', label: '全部'}, {id: 'neg', label: '只清負快取'}, {id: 'expired', label: '只清已過期'}, {id: 'suffix', label: 'qname 後綴'}]} />
          {scope === 'suffix' && <TextField label="後綴" defaultValue="bilibili.com" />}
          <span className="rp-label">{dnsCache.length} 條，正 3，負 2</span>
          <Button negative onPress={() => toast('positive', 'flush 完成，清除 ' + (scope === 'all' ? dnsCache.length : 2) + ' 條')}>flush</Button>
          <span className="rp-label">列表與單刪要引擎補 GET / DELETE；現在只有整體 flush。查詢用 qname，不用 domain。</span>
        </div>
      </div>
    </div>
  );
}
