import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import {useFlow, useFlows} from '../../api/store';
import {connectionStates, flowStepFields, relativeStart} from '../../api/selectors';
import {page, card, h3, label, toolbar, note, code, Kv} from '../ui';
import type {PageProps} from '../Shell';

const badge = style({font: 'detail', backgroundColor: 'gray-200', borderRadius: 'sm', paddingX: 8, paddingY: 4});
const timeline = style({display: 'flex', flexDirection: 'column', gap: 16, margin: 0, paddingStart: 24});
const stepStyle = style({borderStartWidth: 2, borderStyle: 'solid', borderColor: 'gray-300', paddingStart: 16, paddingY: 8});
const raw = style({font: 'code-sm', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'});
const coverageLabels: Record<string, string> = {userspace_tcp: '使用者空間 TCP', userspace_udp: '使用者空間 UDP', kernel_direct: '核心直連', kernel_block: '核心封鎖', dns_intercept: 'DNS 攔截', kernel_bypass: '核心旁路'};
const visibility: Record<string, string> = {full: '完整', partial: '部分', none: '無', unknown: '未知'};
export function Flows({go, query}: PageProps) {
  const [network, setNetwork] = useState<Key>('all');
  const [state, setState] = useState<Key>('all');
  const resource = useFlows();
  const id = new URLSearchParams(query).get('id') ?? resource.data?.flows[0]?.id ?? null;
  const detail = useFlow(id);
  const flow = detail.data;
  const shown = (resource.data?.flows ?? []).filter(f => (network === 'all' || f.network === network) && (state === 'all' || f.state === state));
  return <div className={page}>
    {resource.error && <p role="alert" className={note}>無法載入流程：{resource.error.message}</p>}
    {resource.loading && !resource.data && <p role="status">載入中…</p>}
    <div className={toolbar}>
      <SegmentedControl aria-label="網路協定" selectedKey={network} onSelectionChange={setNetwork}><SegmentedControlItem id="all">全部</SegmentedControlItem><SegmentedControlItem id="tcp">TCP</SegmentedControlItem><SegmentedControlItem id="udp">UDP</SegmentedControlItem></SegmentedControl>
      <Picker label="狀態" labelPosition="side" selectedKey={state} onSelectionChange={k => k != null && setState(k)}><PickerItem id="all">全部狀態</PickerItem>{Object.entries(connectionStates).map(([id, text]) => <PickerItem id={id} key={id}>{text}</PickerItem>)}</Picker>
    </div>
    <div className={toolbar} aria-label="觀測涵蓋範圍">{resource.data && Object.entries(resource.data.coverage).map(([scope, value]) => <span key={scope} className={badge}>{coverageLabels[scope] ?? scope}：{visibility[value] ?? value}</span>)}</div>
    <TableView aria-label="流程" selectionMode="single" selectedKeys={id ? [id] : []} onSelectionChange={keys => { if (keys !== 'all') { const value = [...keys][0]; if (value != null) go('flows', 'id=' + encodeURIComponent(value)); } }} styles={style({height: 250})}>
      <TableHeader><Column id="id" isRowHeader>流程</Column><Column id="target">目標</Column><Column id="network" width={80}>協定</Column><Column id="state" width={100}>狀態</Column><Column id="started" width={100}>開始</Column></TableHeader>
      <TableBody items={shown} renderEmptyState={() => '沒有符合的流程'}>{f => <Row id={f.id}><Cell>{f.id}</Cell><Cell>{f.input?.domain || f.input?.dst || '—'}</Cell><Cell>{f.network.toUpperCase()}</Cell><Cell>{connectionStates[f.state] ?? f.state}</Cell><Cell>{relativeStart(f.started_at)}</Cell></Row>}</TableBody>
    </TableView>
    {detail.error && <p role="alert" className={note}>無法載入流程記錄：{detail.error.message}</p>}
    {detail.loading && !flow && id && <p role="status">流程記錄載入中…</p>}
    {flow && <section className={card} aria-label="流程記錄">
      <div className={toolbar}><h3 className={h3}>{flow.id}</h3><span className={badge}>{flow.trace.status}</span><span className={label}>修訂 {flow.revision}</span></div>
      <p className={note}>{flow.trace.status === 'partial' ? '流程記錄不完整，未記錄的階段無法還原。' : flow.trace.status === 'disabled' ? '流程追蹤已停用，沒有階段記錄。' : '流程記錄完整。'}</p>
      <Kv items={[["missing", flow.trace.missing.join('、') || '—'], ['連線', flow.connection_id ?? '—'], ['狀態', connectionStates[flow.state] ?? flow.state]]} />
      <ol className={timeline}>{[...flow.trace.steps].sort((a, b) => a.seq - b.seq).map(step => {
        const fields = flowStepFields(step);
        return <li key={step.seq} className={stepStyle}>
          <div className={toolbar}><span className={badge}>{step.stage}</span><span className={code}>seq {step.seq}</span><time dateTime={step.observed_at ?? undefined}>{step.observed_at ?? '—'}</time><span className={label}>{step.elapsed_us ?? '—'} μs</span></div>
          {fields ? <Kv items={fields} /> : <pre className={raw}><code>{JSON.stringify(step.data, null, 2)}</code></pre>}
        </li>;
      })}</ol>
    </section>}
  </div>;
}
