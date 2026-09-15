import {useMemo, useState} from 'react';
import {SearchField, Input} from 'react-aria-components';
import Search from '@react-spectrum/s2/icons/Search';
import ListBulleted from '@react-spectrum/s2/icons/ListBulleted';
import DeviceAll from '@react-spectrum/s2/icons/DeviceAll';
import {conns, groups, type Conn} from '../../app/mock';
import {Button, DataTable, Kv, LabeledSelect, Light, ModalDialog, Segmented, toast} from '../ui';
import {Button as RButton} from 'react-aria-components';
import Close from '@react-spectrum/s2/icons/Close';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from './types';
import {Flag} from '../../app/Flag';

export function Connections({go, query}: PageProps) {
  const q = new URLSearchParams(query);
  const [text, setText] = useState(q.get('q') || q.get('src') || '');
  const [plane, setPlane] = useState(q.get('plane') || 'all');
  const [out, setOut] = useState('all');
  const [sel, setSel] = useState<string | null>('2');
  const shown = useMemo(() => conns.filter(c => (plane === 'all' || c.plane === plane) && (out === 'all' || c.out === out) && (!text || [c.dst, c.host, c.src, c.mac, c.out].join(' ').includes(text))), [text, plane, out]);
  const cur: Conn | undefined = conns.find(c => c.id === sel);
  const proxy = groups[0];
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <SearchField aria-label="篩選" value={text} onChange={setText} className="rp-input" style={{width: 280}}><Search /><Input placeholder="域名、IP、來源、MAC" /><RButton className="clear" aria-label="清除"><Close /></RButton></SearchField>
        <Segmented label="平面" value={plane} onChange={setPlane} items={[['all', '全部 ' + conns.length], ['內核', '內核'], ['userspace', 'userspace'], ['拒絕', '拒絕']]} />
        <LabeledSelect label="出站" side value={out} onChange={setOut} items={[{id: 'all', label: '所有出站'}, {id: 'direct', label: 'direct'}, {id: 'block', label: 'block'}, ...groups.map(g => ({id: g.name, label: g.name}))]} />
        <Button onPress={() => { setText(''); setPlane('all'); setOut('all'); }}>清除篩選</Button>
      </div>
      <div className="rp-split">
        <DataTable label="連線" rows={shown} selected={sel} onSelect={setSel} empty="沒有符合的連線"
          cols={[{id: 'dst', label: '目標', isRowHeader: true}, {id: 'src', label: '來源', width: 112}, {id: 'out', label: '出站', width: 136}, {id: 'plane', label: '平面', width: 100}, {id: 'down', label: '下載', width: 88, align: 'end'}, {id: 'age', label: '時長', width: 88, align: 'end'}]}
          render={c => [c.host ? c.host + c.dst.slice(c.dst.lastIndexOf(':')) : c.dst, <span className="rp-code">{c.src}</span>, c.chain.join(' → '), c.plane, c.down, c.age]} />
        {cur ? (
          <div className="rp-card">
            <h3 className="rp-h3">{cur.host || cur.dst}</h3>
            <Light small tone={cur.plane === '拒絕' ? 'err' : 'ok'}>{cur.plane === '拒絕' ? '已拒絕' : cur.plane + '轉發'}，{cur.proto.toUpperCase()}{cur.host ? '，' + cur.dst : ''}</Light>
            <Kv items={[['來源', cur.src], ['MAC', cur.mac || '未知'], ['規則', cur.rule], ['引用', cur.ruleRef || '無'], ['選擇鏈', cur.chain.join(' → ')], ['流量', '上傳 ' + cur.up + '，下載 ' + cur.down], ['追蹤', cur.age]]} />
            <div className="rp-group-btns">
              <Button small onPress={() => go('rules')}><ListBulleted />規則</Button>
              <Button small onPress={() => go('clients')}><DeviceAll />客戶端</Button>
            </div>
            <div className="rp-col">
              <RuleDialog trigger={<Button accent>新增規則</Button>} presets={[
                ...(cur.host ? [{label: '域名 ' + cur.host, cond: 'domain(full: ' + cur.host + ')'}] : []),
                {label: '目標 IP', cond: 'dip(' + cur.dst.replace(/:\d+$/, '') + ')'},
                {label: '來源 ' + cur.src, cond: 'sip(' + cur.src + ')'},
                ...(cur.mac ? [{label: 'MAC ' + cur.mac, cond: 'mac(' + cur.mac + ')'}] : [])]} />
              {cur.chain[0] === proxy.name && <LabeledSelect label={proxy.name + ' 的選擇（只影響後續撥號）'} value={proxy.selected ?? proxy.members[0]} onChange={k => toast('positive', proxy.name + ' 已切換至 ' + k + '，已儲存')} items={proxy.members.map(m => ({id: m, label: m, icon: <Flag name={m} />}))} />}
              {cur.canTerminate ? <ModalDialog alert narrow trigger={<Button negative>中止這條連線</Button>} title="中止連線" footer={close => <><Button secondary onPress={close}>取消</Button><Button negative onPress={() => { close(); toast('positive', '已中止 ' + (cur.host || cur.dst)); }}>中止</Button></>}><p className="rp-note">中止 {cur.host || cur.dst} 的這條連線；用戶端會收到連線重設。</p></ModalDialog> : <Button negative isDisabled tip={cur.plane === '拒絕' ? '沒有連線可中止' : '此連線由內核轉發，honk 無法中止'}>中止這條連線</Button>}
            </div>
          </div>
        ) : <div className="rp-card"><span className="rp-label">選一條連線，右側列它的路由結果與能做的事。</span></div>}
      </div>
    </div>
  );
}
