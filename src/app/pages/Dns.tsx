import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {TextField} from '@react-spectrum/s2/TextField';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {Button} from '@react-spectrum/s2/Button';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Text} from '@react-spectrum/s2/Text';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import Delete from '@react-spectrum/s2/icons/Delete';
import {page, split, card, code, inline, label, between, col, h3, Kv, toast} from '../ui';
import {dnsCache} from '../mock';
import type {PageProps} from '../Shell';

const form = style({display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap'});
export function Dns(_: PageProps) {
  const [qname, setQname] = useState('cdn.bilibili.com');
  const [qtype, setQtype] = useState<Key>('A');
  const [asked, setAsked] = useState<{qname: string, qtype: string} | null>({qname: 'cdn.bilibili.com', qtype: 'A'});
  const [scope, setScope] = useState<Key>('all');
  return (
    <div className={page}>
      <div className={split}>
        <div className={col}>
          <div className={card}>
            <div className={form}>
              <TextField label="qname" value={qname} onChange={setQname} styles={style({width: 280})} />
              <Picker label="qtype" selectedKey={qtype} onSelectionChange={k => k != null && setQtype(k)}>{['A', 'AAAA', 'HTTPS', 'TXT', 'MX'].map(t => <PickerItem key={t} id={t}>{t}</PickerItem>)}</Picker>
              <Button variant="accent" onPress={() => setAsked({qname, qtype: String(qtype)})}>查詢</Button>
            </div>
            {asked && (
              <>
                <h3 className={h3}>{asked.qname} {asked.qtype}</h3>
                <Kv items={[['狀態', 'NOERROR，1 筆'], ['路由', 'qname(geosite: cn) -> alidns'], ['上游', 'udp://223.5.5.5'], ['快取', '命中，剩 58 秒'], ['回應', '120.92.78.14'], ['時序', '路由 0.1 ms，上游 8.4 ms，回應 0.3 ms']]} />
              </>
            )}
          </div>
          <TableView aria-label="快取" styles={style({height: 292})}>
            <TableHeader><Column id="q" isRowHeader>qname</Column><Column id="t" width={88}>qtype</Column><Column id="k" width={80}>正負</Column><Column id="u" width={170}>上游</Column><Column id="e" width={100}>過期</Column><Column id="a" width={64}>刪除</Column></TableHeader>
            <TableBody items={dnsCache}>
              {c => <Row id={c.id}><Cell><span className={code}>{c.qname}</span></Cell><Cell>{c.qtype}</Cell><Cell>{c.kind}</Cell><Cell>{c.upstream}</Cell><Cell>{c.expires}</Cell><Cell><div className={inline}><TooltipTrigger><ActionButton isQuiet size="S" aria-label="刪這條" onPress={() => toast('positive', '已刪 ' + c.qname + ' ' + c.qtype)}><Delete /></ActionButton><Tooltip>刪這條快取</Tooltip></TooltipTrigger></div></Cell></Row>}
            </TableBody>
          </TableView>
        </div>
        <div className={card}>
          <h3 className={h3}>flush</h3>
          <Picker label="範圍" selectedKey={scope} onSelectionChange={k => k != null && setScope(k)}><PickerItem id="all">全部</PickerItem><PickerItem id="neg">只清負快取</PickerItem><PickerItem id="expired">只清已過期</PickerItem><PickerItem id="suffix">qname 後綴</PickerItem></Picker>
          {scope === 'suffix' && <TextField label="後綴" defaultValue="bilibili.com" />}
          <div className={between}><span className={label}>{dnsCache.length} 條，正 3，負 2</span><Button variant="negative" fillStyle="outline" onPress={() => toast('positive', 'flush 完成，清除 ' + (scope === 'all' ? dnsCache.length : 2) + ' 條')}>flush</Button></div>
          <span className={label}>列表與單刪要引擎補 GET / DELETE；現在只有整體 flush。查詢用 qname，不用 domain。</span>
        </div>
      </div>
    </div>
  );
}
