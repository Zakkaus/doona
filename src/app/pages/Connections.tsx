import {useMemo, useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {SearchField} from '@react-spectrum/s2/SearchField';
import {Button} from '@react-spectrum/s2/Button';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Text} from '@react-spectrum/s2/Text';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key, Selection} from '@react-spectrum/s2';
import ListBulleted from '@react-spectrum/s2/icons/ListBulleted';
import DeviceAll from '@react-spectrum/s2/icons/DeviceAll';
import {page, split, card, code, col, label, h3, toolbar, Kv, PlaneBadge, toast} from '../ui';
import {conns, groups, type Conn} from '../mock';
import {Flag} from '../Flag';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from '../Shell';

export function Connections({go, query}: PageProps) {
  const q = new URLSearchParams(query);
  const [text, setText] = useState(q.get('q') || q.get('src') || '');
  const [plane, setPlane] = useState<Key>(q.get('plane') || 'all');
  const [out, setOut] = useState<Key>('all');
  const [sel, setSel] = useState<Selection>(new Set<Key>(['2']));
  const shown = useMemo(() => conns.filter(c => (plane === 'all' || c.plane === plane) && (out === 'all' || c.out === out) && (!text || [c.dst, c.host, c.src, c.mac, c.out].join(' ').includes(text))), [text, plane, out]);
  const cur: Conn | undefined = conns.find(c => sel !== 'all' && sel.has(c.id));
  const proxy = groups[0];
  return (
    <div className={page}>
      <div className={toolbar}>
        <SearchField aria-label="過濾" placeholder="域名、IP、來源、MAC" value={text} onChange={setText} styles={style({width: 280})} />
        <SegmentedControl aria-label="平面" selectedKey={plane} onSelectionChange={setPlane}><SegmentedControlItem id="all">全部 {conns.length}</SegmentedControlItem><SegmentedControlItem id="內核">內核</SegmentedControlItem><SegmentedControlItem id="userspace">userspace</SegmentedControlItem><SegmentedControlItem id="拒絕">拒絕</SegmentedControlItem></SegmentedControl>
        <Picker aria-label="出站" selectedKey={out} onSelectionChange={k => k != null && setOut(k)}><PickerItem id="all">所有出站</PickerItem><PickerItem id="direct">direct</PickerItem><PickerItem id="block">block</PickerItem>{groups.map(g => <PickerItem key={g.name} id={g.name}>{g.name}</PickerItem>)}</Picker>
        <ActionButton onPress={() => { setText(''); setPlane('all'); setOut('all'); }}><Text>清除過濾</Text></ActionButton>
      </div>
      <div className={split}>
        <TableView aria-label="連線" selectionMode="single" selectedKeys={sel} onSelectionChange={setSel} styles={style({height: 442})}>
          <TableHeader>
            <Column id="dst" isRowHeader minWidth={150}>目標</Column><Column id="src" width={112}>來源</Column><Column id="out" width={136}>出站</Column><Column id="plane" width={100}>平面</Column><Column id="down" width={80}>下載</Column><Column id="age" width={80}>時長</Column>
          </TableHeader>
          <TableBody items={shown} renderEmptyState={() => '沒有符合的連線'}>
            {c => <Row id={c.id}><Cell textValue={c.host || c.dst}>{c.host ? c.host + c.dst.slice(c.dst.lastIndexOf(':')) : c.dst}</Cell><Cell><span className={code}>{c.src}</span></Cell><Cell>{c.chain.join(' → ')}</Cell><Cell><PlaneBadge plane={c.plane} /></Cell><Cell>{c.down}</Cell><Cell>{c.age}</Cell></Row>}
          </TableBody>
        </TableView>
        {cur ? (
          <div className={card}>
            <h3 className={h3}>{cur.host || cur.dst}</h3>
            <StatusLight variant={cur.plane === '拒絕' ? 'negative' : 'positive'} size="S"><Text>{cur.plane === '拒絕' ? '已拒絕' : cur.plane + '轉發'}，{cur.proto.toUpperCase()}{cur.host ? '，' + cur.dst : ''}</Text></StatusLight>
            <Kv items={[['來源', cur.src], ['MAC', cur.mac || '未知'], ['規則', cur.rule], ['引用', cur.ruleRef || '無'], ['選擇鏈', cur.chain.join(' → ')], ['流量', '上傳 ' + cur.up + '，下載 ' + cur.down], ['追蹤', cur.age]]} />
            <ActionButtonGroup size="S">
              <ActionButton onPress={() => go('rules')}><ListBulleted /><Text>規則</Text></ActionButton>
              <ActionButton onPress={() => go('clients')}><DeviceAll /><Text>客戶端</Text></ActionButton>
            </ActionButtonGroup>
            <div className={col}>
              <RuleDialog trigger={<Button variant="accent">加規則</Button>} presets={[
                ...(cur.host ? [{label: '域名 ' + cur.host, cond: 'domain(full: ' + cur.host + ')'}] : []),
                {label: '目標 IP', cond: 'dip(' + cur.dst.replace(/:\d+$/, '') + ')'},
                {label: '來源 ' + cur.src, cond: 'sip(' + cur.src + ')'},
                ...(cur.mac ? [{label: 'MAC ' + cur.mac, cond: 'mac(' + cur.mac + ')'}] : [])]} />
              {cur.chain[0] === proxy.name && <Picker label={proxy.name + ' 的選擇（只影響後續撥號）'} selectedKey={proxy.selected} onSelectionChange={k => toast('positive', proxy.name + ' 改選 ' + String(k) + '，已持久化')}>{proxy.members.map(m => <PickerItem key={m} id={m} textValue={m}><Text slot="label"><Flag name={m} />{m}</Text></PickerItem>)}</Picker>}
              <TooltipTrigger isDisabled={cur.canTerminate}>
                <Button variant="negative" fillStyle="outline" isDisabled={!cur.canTerminate} onPress={() => toast('positive', '已中止 ' + (cur.host || cur.dst))}>中止這條連線</Button>
                <Tooltip>{cur.plane === '拒絕' ? '沒有連線可中止' : '這條流在內核轉發，honk 不能中止它'}</Tooltip>
              </TooltipTrigger>
            </div>
          </div>
        ) : <div className={card}><span className={label}>選一條連線，右側列它的路由結果與能做的事。</span></div>}
      </div>
    </div>
  );
}
