import {useState} from 'react';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Data from '@react-spectrum/s2/icons/Data';
import {groups, runtime} from '../../app/mock';
import {Badge, Button, LabeledSelect, Light, Segmented, toast} from '../ui';
import {NodeGrid} from '../Nodes';
import type {PageProps} from './types';

const LABELS = {timeout: '逾時', nested: '巢狀組', cur: '目前', filter: '篩選節點', region: '地區', allRegions: '全部地區', sort: '排序', byLatency: '依延遲', byName: '依名稱', aliveOnly: '只看可用', count: (n: number, down: number) => n + ' 個節點' + (down ? '，' + down + ' 個逾時' : ''), none: '沒有符合的節點'};
export function Policies({go}: PageProps) {
  const [mode, setMode] = useState<string>(runtime.mode);
  const [target, setTarget] = useState(runtime.globalTarget);
  const [sel, setSel] = useState<Record<string, string>>({proxy: 'hk-01'});
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <Segmented label="出站模式" value={mode} onChange={k => { setMode(k); toast('positive', '出站模式：' + ({rule: '規則', global: '全域', direct: '直連'} as Record<string, string>)[k]); }} items={[['rule', '規則'], ['global', '全域'], ['direct', '直連']]} />
        {mode === 'global' && <LabeledSelect label="全域目標" side value={target} onChange={setTarget} items={groups.map(g => ({id: g.name, label: g.name}))} />}
        <span className="rp-grow" />
        <Button onPress={() => go('resources')}><Data />訂閱來源</Button>
      </div>
      <p className="rp-note">{mode === 'rule' ? '規則由上至下逐條比對，第一條命中者決定出站。' : 'must 與 block 規則在全域、直連模式下仍然生效。'}只有 selector 組可手動選擇，其他組由策略自動決定。</p>
      <div className="rp-list">
        {groups.map(g => (
          <div key={g.name} className="rp-card">
            <div className="rp-row">
              <span className="rp-cluster"><h3 className="rp-h3">{g.name}</h3><Badge>{g.policy}</Badge><Light small tone="ok">解析到 {g.policy === 'selector' ? sel[g.name] || g.selected || g.leaf : g.leaf}</Light>{g.nodes.length > 12 && <span className="rp-label">{g.nodes.length} 個節點</span>}</span>
              <Button small onPress={() => toast('positive', g.name + ' 測試完成，' + g.nodes.filter(n => !n.alive).map(n => n.name + ' 逾時').join('，'))}><Refresh />測試全部</Button>
            </div>
            <NodeGrid labels={LABELS} nodes={g.members.map(m => { const n = g.nodes.find(x => x.name === m); return n ? {name: m, tcp: n.tcp, udp: n.udp, v6: n.v6, alive: n.alive} : {name: m, nested: true}; })}
              {...(g.policy === 'selector' ? {selected: sel[g.name] || g.selected || g.leaf, onSelect: (m: string) => { setSel({...sel, [g.name]: m}); toast('positive', g.name + ' 改選 ' + m + '，已持久化'); }} : {cur: g.leaf})} />
          </div>
        ))}
      </div>
    </div>
  );
}
