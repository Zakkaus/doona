import {useState} from 'react';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Data from '@react-spectrum/s2/icons/Data';
import {groups, runtime, type Node} from '../../app/mock';
import {Badge, Button, LabeledSelect, Light, Segmented, ToggleTile, toast} from '../ui';
import type {PageProps} from './types';

const health = (n: Node) => n.alive ? 'TCP ' + n.tcp + ' ms，UDP ' + n.udp + ' ms' + (n.v6 ? '，v6' : '') : '逾時';
export function Policies({go}: PageProps) {
  const [mode, setMode] = useState<string>(runtime.mode);
  const [target, setTarget] = useState(runtime.globalTarget);
  const [sel, setSel] = useState<Record<string, string>>({proxy: 'hk-01'});
  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <Segmented label="出站模式" value={mode} onChange={k => { setMode(k); toast('positive', '出站模式已改為 ' + k); }} items={[['rule', '規則'], ['global', '全域'], ['direct', '直連']]} />
        <LabeledSelect label="全域目標" side value={target} onChange={setTarget} isDisabled={mode !== 'global'} items={groups.map(g => ({id: g.name, label: g.name}))} />
        <Button onPress={() => go('resources')}><Data />訂閱來源</Button>
      </div>
      <p className="rp-note">{mode === 'rule' ? '規則由上至下逐條比對，第一條命中者決定出站。' : 'must 與 block 規則在全域、直連模式下仍然生效。'}只有 selector 組可手動選擇，其他組由策略自動決定。</p>
      <div className="rp-list">
        {groups.map(g => (
          <div key={g.name} className="rp-card">
            <div className="rp-row">
              <span className="rp-cluster"><h3 className="rp-h3">{g.name}</h3><Badge>{g.policy}</Badge><Light small tone="ok">解析到 {g.policy === 'selector' ? sel[g.name] || g.leaf : g.leaf}</Light></span>
              <Button small onPress={() => toast('positive', g.name + ' 測試完成，' + g.nodes.filter(n => !n.alive).map(n => n.name + ' 逾時').join('，'))}><Refresh />測試全部</Button>
            </div>
            <div className="rp-nodes">
              {g.members.map(m => {
                const n = g.nodes.find(x => x.name === m);
                const sub = n ? health(n) : '巢狀組';
                if (g.policy !== 'selector') return <div key={m} className={'rp-member' + (g.leaf === m ? ' cur' : '')}><span className="n">{m}</span><span className="s">{sub}</span></div>;
                return <ToggleTile key={m} selected={sel[g.name] === m} onPress={() => { setSel({...sel, [g.name]: m}); toast('positive', g.name + ' 改選 ' + m + '，已持久化'); }} name={m} sub={sub} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
