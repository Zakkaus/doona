import {useMemo, useState} from 'react';
import {useFlow, useFlows} from '../../api/store';
import {chainLabel, connectionStates, flowStepFields, relativeStart} from '../../api/selectors';
import {Badge, DataTable, Kv, LabeledSelect, Segmented} from '../../ui/ui';
import type {PageProps} from '../types';
import {useT} from '../../i18n/i18n';

const coverageLabels: Record<string, string> = {
  userspace_tcp: '使用者空間 TCP',
  userspace_udp: '使用者空間 UDP',
  kernel_direct: '核心直連',
  kernel_block: '核心封鎖',
  dns_intercept: 'DNS 攔截',
  kernel_bypass: '核心旁路'
};
const visibility: Record<string, string> = {full: '完整', partial: '部分', none: '無', unknown: '未知'};
export function Flows({go, query}: PageProps) {
  const t = useT();
  const [network, setNetwork] = useState('all');
  const [state, setState] = useState('all');
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const connectionId = params.get('connection_id') ?? undefined;
  const resource = useFlows(connectionId);
  const id = params.get('id') ?? resource.data?.flows.find(f => !connectionId || f.connection_id === connectionId)?.id ?? null;
  const detail = useFlow(id);
  const flow = detail.data;
  const shown = (resource.data?.flows ?? []).filter(f => (network === 'all' || f.network === network) && (state === 'all' || f.state === state));
  return (
    <div className="rp-page">
      {resource.error && (
        <p role="alert" className="rp-note">
          無法載入流程：{resource.error.message}
        </p>
      )}
      {resource.loading && !resource.data && <p role="status">載入中…</p>}
      <div className="rp-toolbar">
        <Segmented
          label="網路協定"
          value={network}
          onChange={setNetwork}
          items={[
            ['all', '全部'],
            ['tcp', 'TCP'],
            ['udp', 'UDP']
          ]}
        />
        <LabeledSelect
          label="狀態"
          side
          value={state}
          onChange={setState}
          items={[{id: 'all', label: '全部狀態'}, ...Object.entries(connectionStates).map(([id, label]) => ({id, label}))]}
        />
      </div>
      <div className="rp-toolbar" aria-label="觀測涵蓋範圍">
        {resource.data &&
          Object.entries(resource.data.coverage).map(([scope, value]) => (
            <Badge key={scope} tone={value === 'full' ? undefined : 'warn'}>
              {coverageLabels[scope] ?? scope}：{visibility[value] ?? value}
            </Badge>
          ))}
      </div>
      <DataTable
        label="流程"
        rows={shown}
        height={250}
        selected={id}
        onSelect={value => value && go('flows', 'id=' + encodeURIComponent(value))}
        empty="沒有符合的流程"
        cols={[
          {id: 'id', label: '流程', width: 140, isRowHeader: true},
          {id: 'target', label: '目標', width: 180},
          {id: 'chain', label: t('conn.chain'), width: 180},
          {id: 'rule', label: t('conn.rule'), width: 220},
          {id: 'network', label: '協定', width: 80},
          {id: 'state', label: '狀態', width: 100},
          {id: 'started', label: '開始', width: 104}
        ]}
        render={f => [
          f.id,
          f.input?.domain || f.input?.dst || '—',
          chainLabel(f),
          <span className="rp-rule">
            <span title={f.rule_expression ?? undefined}>{f.rule_expression ?? '—'}</span>
            {f.rule_source === 'recomputed' ? (
              <small className="rp-provenance">{t('conn.recomputed')}</small>
            ) : f.rule_source === 'unknown' ? (
              <small className="rp-provenance">—</small>
            ) : null}
          </span>,
          f.network.toUpperCase(),
          connectionStates[f.state] ?? f.state,
          relativeStart(f.started_at)
        ]}
      />
      {detail.error && (
        <p role="alert" className="rp-note">
          無法載入流程記錄：{detail.error.message}
        </p>
      )}
      {detail.loading && !flow && id && <p role="status">流程記錄載入中…</p>}
      {flow && (
        <section className="rp-card" aria-label="流程記錄">
          <div className="rp-row">
            <h3 className="rp-h3">{flow.id}</h3>
            <Badge>{flow.trace.status}</Badge>
            <span className="rp-label">修訂 {flow.revision}</span>
          </div>
          <p className="rp-note">
            {flow.trace.status === 'partial'
              ? '流程記錄不完整，未記錄的階段無法還原。'
              : flow.trace.status === 'disabled'
                ? '流程追蹤已停用，沒有階段記錄。'
                : '流程記錄完整。'}
          </p>
          <Kv
            items={[
              ['missing', flow.trace.missing.join('、') || '—'],
              ['連線', flow.connection_id ?? '—'],
              ['狀態', connectionStates[flow.state] ?? flow.state]
            ]}
          />
          <ol className="rp-flow-timeline">
            {[...flow.trace.steps]
              .sort((a, b) => a.seq - b.seq)
              .map(step => {
                const fields = flowStepFields(step);
                return (
                  <li key={step.seq} className="rp-flow-step">
                    <div className="rp-toolbar">
                      <Badge>{step.stage}</Badge>
                      <span className="rp-code">seq {step.seq}</span>
                      <time dateTime={step.observed_at ?? undefined}>{step.observed_at ?? '—'}</time>
                      <span className="rp-label">{step.elapsed_us ?? '—'} μs</span>
                    </div>
                    {fields ? (
                      <Kv items={fields} />
                    ) : (
                      <pre className="rp-flow-raw">
                        <code>{JSON.stringify(step.data, null, 2)}</code>
                      </pre>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      )}
    </div>
  );
}
