import {useMemo} from 'react';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Data from '@react-spectrum/s2/icons/Data';
import {useGroupControl, useGroups, useNodes} from '../../api/store';
import {groupConfigFields, preferredHealth, probeSummary} from '../../api/selectors';
import type {HealthObservation} from '../../api/model';
import {Badge, Button, Kv, Segmented, Switch, toast} from '../ui';
import {NodeGrid} from '../Nodes';
import type {PageProps} from './types';

const LABELS = {timeout: '無法使用', nested: '群組', cur: '目前', filter: '篩選節點', region: '地區', allRegions: '全部地區', sort: '排序', byLatency: '依延遲', byName: '依名稱', aliveOnly: '只看可用', count: (n: number, down: number) => n + ' 個成員' + (down ? '，' + down + ' 個無法使用' : ''), none: '沒有符合的節點'};
function PolicyCard({id, health, refreshGroups, refreshNodes}: {id: string, health: Map<string, HealthObservation | undefined>, refreshGroups: () => void, refreshNodes: () => void}) {
  const control = useGroupControl(id, refreshGroups, refreshNodes);
  const g = control.data;
  const members = useMemo(() => g?.members.map(m => ({...m, health: health.get(m.id)})) ?? [], [g, health]);
  const tcp = g?.runtime.selection.tcp?.member_id;
  const udp = g?.runtime.selection.udp?.member_id;
  const selected = control.network === 'tcp' ? tcp : control.network === 'udp' ? udp : tcp === udp ? tcp : undefined;
  const selectable = g?.policy.kind === 'selector' && g.capabilities.can_select;
  const healthy = members.filter(m => m.health?.state === 'healthy').length;
  const unavailable = members.filter(m => m.health?.state === 'unavailable').length;
  return <section className="rp-card" aria-label={g?.name ?? id}>
    {control.error && <p role="alert" className="rp-note">無法讀取或更新群組：{control.error.message}</p>}
    {!g ? <p role="status">{id} 載入中…</p> : <>
      <div className="rp-row">
        <span className="rp-cluster"><h3 className="rp-h3">{g.name}</h3><Badge>{g.policy.kind}</Badge><span className="rp-label">{members.length} 個成員</span></span>
        <Button small isDisabled={!!control.busy || !g.capabilities.probe_transports.includes('tcp')} tip={!g.capabilities.probe_transports.includes('tcp') ? '此群組不支援 TCP 探測' : undefined} onPress={() => { void control.probe().then(result => { if (result) toast('positive', g.name + '：' + probeSummary(result)); }); }}><Refresh />{control.busy === 'probe' ? '測試中…' : '測試全部'}</Button>
      </div>
      <Kv inline items={[["TCP 選擇", tcp ?? '—'], ['UDP 選擇', udp ?? '—'], ['健康狀態', healthy + ' 個可用，' + unavailable + ' 個無法使用'], ['配置修訂', g.config_revision]]} />
      <details><summary>配置</summary><Kv items={groupConfigFields(g)} /></details>
      <div className="rp-toolbar">
        {selectable && <Segmented label={g.name + ' 選擇網路'} value={control.network} onChange={value => { if (value === 'both' || value === 'tcp' || value === 'udp') control.setNetwork(value); }} items={[["both", '兩者'], ['tcp', 'TCP'], ['udp', 'UDP']]} />}
        {g.capabilities.mutable_config.includes('interrupt_connections') && <Switch isSelected={g.config.interrupt_connections} isDisabled={!!control.busy} onChange={value => { void control.setInterrupt(value).then(saved => { if (saved) toast('positive', g.name + ' 配置已更新'); }); }}>切換時中斷現有連線</Switch>}
      </div>
      <NodeGrid labels={LABELS} nodes={members} selected={selected} cur={selected} isDisabled={!!control.busy}
        onSelect={selectable ? memberId => { void control.select(memberId).then(result => { if (result) toast('positive', g.name + ' 已選擇 ' + result.member_id + '；' + (result.connections_interrupted ? '現有連線已中斷' : '現有連線未中斷')); }); } : undefined} />
    </>}
  </section>;
}
export function Policies({go}: PageProps) {
  const groups = useGroups();
  const nodes = useNodes();
  const health = useMemo(() => new Map((nodes.data ?? []).map(n => [n.id, preferredHealth(n)])), [nodes.data]);
  return <div className="rp-page">
    <div className="rp-toolbar"><p className="rp-note">僅支援手動選擇的 selector 群組可切換成員。TCP 與 UDP 可分別選擇。</p><span className="rp-grow" /><Button onPress={() => go('resources')}><Data />訂閱來源</Button></div>
    {(groups.error || nodes.error) && <p role="alert" className="rp-note">無法載入策略：{(groups.error ?? nodes.error)?.message}</p>}
    {groups.loading && !groups.data && <p role="status">載入中…</p>}
    {groups.data?.length === 0 && <p className="rp-note">沒有群組。</p>}
    <div className="rp-list">{groups.data?.map(g => <PolicyCard key={g.id} id={g.id} health={health} refreshGroups={groups.refetch} refreshNodes={nodes.refetch} />)}</div>
  </div>;
}
