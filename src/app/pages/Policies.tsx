import {useMemo, useState} from 'react';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {ToggleButton} from '@react-spectrum/s2/ToggleButton';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Text} from '@react-spectrum/s2/Text';
import {SearchField} from '@react-spectrum/s2/SearchField';
import {Switch} from '@react-spectrum/s2/Switch';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Data from '@react-spectrum/s2/icons/Data';
import {useGroupControl, useGroups, useNodes} from '../../api/store';
import {groupConfigFields, preferredHealth, probeSummary} from '../../api/selectors';
import type {Group, HealthObservation} from '../../api/model';
import {page, row, card, cardHead, label, list, note, h3, Kv, toast} from '../ui';
import {regionOf} from '../geo';
import {Flag} from '../Flag';
import type {PageProps} from '../Shell';

const grid = style({display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8});
const nodeName = style({display: 'block', fontSize: 'ui-lg', fontWeight: 'bold', lineHeight: 'ui'});
const nodeSub = style({display: 'block', fontSize: 'ui-sm', fontWeight: 'normal', lineHeight: 'ui'});
const member = style({display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, paddingX: 16, borderRadius: 'default', backgroundColor: {default: 'gray-100', isSelected: 'blue-100'}, font: 'ui', color: {default: 'neutral', isSelected: 'blue-1000'}, textAlign: 'center', boxSizing: 'border-box'});
const badge = style({font: 'detail', backgroundColor: 'gray-200', borderRadius: 'sm', paddingX: 8, paddingY: 2});
const PAGE = 36;
function GroupNodes({g, health, selected, pick, disabled}: {g: Group, health: Map<string, HealthObservation | undefined>, selected?: string, pick?: (id: string) => void, disabled: boolean}) {
  const [q, setQ] = useState('');
  const [aliveOnly, setAliveOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const big = g.members.length > 12;
  const needle = q.trim().toLowerCase();
  const members = big ? g.members.filter(m => (!needle || m.name.toLowerCase().includes(needle) || (regionOf(m.name) ?? '').toLowerCase() === needle) && (!aliveOnly || health.get(m.id)?.state === 'healthy')) : g.members;
  const down = g.members.filter(m => health.get(m.id)?.state === 'unavailable').length;
  return <>
    {big && <div className={row}><SearchField aria-label="篩選節點" value={q} onChange={v => { setQ(v); setShown(PAGE); }} size="S" /><Switch isSelected={aliveOnly} onChange={setAliveOnly} size="S">只看可用</Switch><span className={label}>{members.length} 個成員{down ? '，' + down + ' 個無法使用' : ''}</span></div>}
    <div className={grid}>{members.slice(0, big ? shown : undefined).map(m => {
      const h = health.get(m.id);
      const sub = m.kind === 'group' ? <span className={badge}>群組</span> : h?.state === 'unavailable' ? '無法使用' : h?.state === 'healthy' && h.latency_ms !== null ? h.transport.toUpperCase() + ' ' + h.latency_ms + ' ms' : '未知';
      const body = <><span className={nodeName}><Flag name={m.name} />{m.name}</span><span className={nodeSub}>{sub}</span></>;
      return pick ? <ToggleButton key={m.id} size="XL" isEmphasized isSelected={selected === m.id} isDisabled={disabled} onChange={() => pick(m.id)} styles={style({width: 'full'})}><Text>{body}</Text></ToggleButton> : <div key={m.id} className={member({isSelected: selected === m.id})}>{body}</div>;
    })}</div>
    {big && members.length > shown && <div className={row}><ActionButton size="S" onPress={() => setShown(shown + PAGE)}><Text>顯示更多（剩餘 {members.length - shown} 個）</Text></ActionButton></div>}
  </>;
}
function PolicyCard({id, health, refreshGroups, refreshNodes}: {id: string, health: Map<string, HealthObservation | undefined>, refreshGroups: () => void, refreshNodes: () => void}) {
  const control = useGroupControl(id, refreshGroups, refreshNodes);
  const g = control.data;
  const tcp = g?.runtime.selection.tcp?.member_id;
  const udp = g?.runtime.selection.udp?.member_id;
  const selected = control.network === 'tcp' ? tcp : control.network === 'udp' ? udp : tcp === udp ? tcp : undefined;
  const selectable = g?.policy.kind === 'selector' && g.capabilities.can_select;
  const healthy = g?.members.filter(m => health.get(m.id)?.state === 'healthy').length ?? 0;
  const unavailable = g?.members.filter(m => health.get(m.id)?.state === 'unavailable').length ?? 0;
  return <section className={card} aria-label={g?.name ?? id}>
    {control.error && <p role="alert" className={note}>無法讀取或更新群組：{control.error.message}</p>}
    {!g ? <p role="status">{id} 載入中…</p> : <>
      <div className={cardHead}>
        <div className={row}><h3 className={h3}>{g.name}</h3><span className={badge}>{g.policy.kind}</span><span className={label}>{g.members.length} 個成員</span></div>
        <TooltipTrigger isDisabled={g.capabilities.probe_transports.includes('tcp')}><ActionButton size="S" isDisabled={!!control.busy || !g.capabilities.probe_transports.includes('tcp')} onPress={() => { void control.probe().then(result => { if (result) toast('positive', g.name + '：' + probeSummary(result)); }); }}><Refresh /><Text>{control.busy === 'probe' ? '測試中…' : '測試全部'}</Text></ActionButton><Tooltip>此群組不支援 TCP 探測</Tooltip></TooltipTrigger>
      </div>
      <Kv items={[["TCP 選擇", tcp ?? '—'], ['UDP 選擇', udp ?? '—'], ['健康狀態', healthy + ' 個可用，' + unavailable + ' 個無法使用'], ['配置修訂', g.config_revision]]} />
      <details><summary>配置</summary><Kv items={groupConfigFields(g)} /></details>
      <div className={row}>
        {selectable && <SegmentedControl aria-label={g.name + ' 選擇網路'} selectedKey={control.network} onSelectionChange={value => { if (value === 'both' || value === 'tcp' || value === 'udp') control.setNetwork(value); }}><SegmentedControlItem id="both">兩者</SegmentedControlItem><SegmentedControlItem id="tcp">TCP</SegmentedControlItem><SegmentedControlItem id="udp">UDP</SegmentedControlItem></SegmentedControl>}
        {g.capabilities.mutable_config.includes('interrupt_connections') && <Switch size="S" isSelected={g.config.interrupt_connections} isDisabled={!!control.busy} onChange={value => { void control.setInterrupt(value).then(saved => { if (saved) toast('positive', g.name + ' 配置已更新'); }); }}>切換時中斷現有連線</Switch>}
      </div>
      <GroupNodes g={g} health={health} selected={selected} disabled={!!control.busy} pick={selectable ? memberId => { void control.select(memberId).then(result => { if (result) toast('positive', g.name + ' 已選擇 ' + result.member_id + '；' + (result.connections_interrupted ? '現有連線已中斷' : '現有連線未中斷')); }); } : undefined} />
    </>}
  </section>;
}
export function Policies({go}: PageProps) {
  const groups = useGroups();
  const nodes = useNodes();
  const health = useMemo(() => new Map((nodes.data ?? []).map(n => [n.id, preferredHealth(n)])), [nodes.data]);
  return <div className={page}>
    <div className={row}><p className={note}>僅支援手動選擇的 selector 群組可切換成員。TCP 與 UDP 可分別選擇。</p><ActionButton onPress={() => go('resources')}><Data /><Text>訂閱來源</Text></ActionButton></div>
    {(groups.error || nodes.error) && <p role="alert" className={note}>無法載入策略：{(groups.error ?? nodes.error)?.message}</p>}
    {groups.loading && !groups.data && <p role="status">載入中…</p>}
    {groups.data?.length === 0 && <p className={note}>沒有群組。</p>}
    <div className={list}>{groups.data?.map(g => <PolicyCard key={g.id} id={g.id} health={health} refreshGroups={groups.refetch} refreshNodes={nodes.refetch} />)}</div>
  </div>;
}
