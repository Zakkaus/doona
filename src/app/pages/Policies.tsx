import {useState} from 'react';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {ToggleButton} from '@react-spectrum/s2/ToggleButton';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Data from '@react-spectrum/s2/icons/Data';
import {page, row, card, cardHead, label, list, note, h3, toast} from '../ui';
import {groups, runtime, type Mode, type Node} from '../mock';
import {Flag} from '../Flag';
import type {PageProps} from '../Shell';

const grid = style({display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8});
const nodeName = style({display: 'block', fontSize: 'ui-lg', fontWeight: 'bold', lineHeight: 'ui'});
const nodeSub = style({display: 'block', fontSize: 'ui-sm', fontWeight: 'normal', lineHeight: 'ui'});
// Members of automatic groups: same shape as the toggle, not clickable, current one tinted.
const member = style({display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, paddingX: 16, borderRadius: 'default', backgroundColor: {default: 'gray-100', isSelected: 'blue-100'}, font: 'ui', color: {default: 'neutral', isSelected: 'blue-1000'}, textAlign: 'center', boxSizing: 'border-box'});
const head = style({display: 'flex', alignItems: 'baseline', gap: 12});
const health = (n: Node) => n.alive ? 'TCP ' + n.tcp + ' ms，UDP ' + n.udp + ' ms' + (n.v6 ? '，v6' : '') : '逾時';
export function Policies({go}: PageProps) {
  const [mode, setMode] = useState<Key>(runtime.mode);
  const [sel, setSel] = useState<Record<string, string>>({proxy: 'hk-01'});
  return (
    <div className={page}>
      <div className={row}>
        <SegmentedControl aria-label="出站模式" selectedKey={mode} onSelectionChange={k => { setMode(k); toast('positive', '出站模式已改為 ' + k); }}><SegmentedControlItem id="rule">規則</SegmentedControlItem><SegmentedControlItem id="global">全域</SegmentedControlItem><SegmentedControlItem id="direct">直連</SegmentedControlItem></SegmentedControl>
        <Picker label="Global 目標" labelPosition="side" selectedKey={runtime.globalTarget} isDisabled={mode !== 'global'}>{groups.map(g => <PickerItem key={g.name} id={g.name}>{g.name}</PickerItem>)}</Picker>
        <ActionButton onPress={() => go('resources')}><Data /><Text>訂閱來源</Text></ActionButton>
      </div>
      <p className={note}>{(mode as Mode) === 'rule' ? '規則由上至下逐條測試，第一條命中的決定出站。' : 'must 與 block 規則在全域、直連下仍然終結。'}只有 selector 組能手選，其他組由策略自動決定。</p>
      <div className={list}>
        {groups.map(g => (
          <div key={g.name} className={card}>
            <div className={cardHead}>
              <div className={head}><h3 className={h3}>{g.name}</h3><span className={label}>{g.policy}</span><StatusLight variant="positive" size="S"><Text>解析到 {g.policy === 'selector' ? sel[g.name] || g.leaf : g.leaf}</Text></StatusLight></div>
              <ActionButtonGroup size="S"><ActionButton onPress={() => toast('positive', g.name + ' 測試完成，' + g.nodes.filter(n => !n.alive).map(n => n.name + ' 逾時').join('，'))}><Refresh /><Text>測試全部</Text></ActionButton></ActionButtonGroup>
            </div>
            <div className={grid}>
              {g.members.map(m => {
                const n = g.nodes.find(x => x.name === m);
                const sub = n ? health(n) : '巢狀組';
                if (g.policy !== 'selector') return <div key={m} className={member({isSelected: g.leaf === m})}><span className={nodeName}><Flag name={m} />{m}</span><span className={nodeSub}>{sub}</span></div>;
                return (
                  <ToggleButton key={m} size="XL" isEmphasized isSelected={sel[g.name] === m} onChange={() => { setSel({...sel, [g.name]: m}); toast('positive', g.name + ' 改選 ' + m + '，已持久化'); }} styles={style({width: 'full'})}>
                    <Text><span className={nodeName}><Flag name={m} />{m}</span><span className={nodeSub}>{sub}</span></Text>
                  </ToggleButton>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
