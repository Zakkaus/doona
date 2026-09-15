import {useMemo, useState} from 'react';
import {useFlow, useFlows} from '../../api/store';
import {chainLabel, connectionStates, flowStepFields, localTime, relativeStart} from '../../api/selectors';
import {Badge, DataTable, Kv, LabeledSelect, Segmented} from '../../ui/ui';
import type {PageProps} from '../types';
import {useT, useLang, LOCALE, formatList} from '../../i18n';
import type {Key} from '../../i18n/messages';

const coverageLabels: Record<string, Key> = {
  userspace_tcp: 'flow.userspaceTcp',
  userspace_udp: 'flow.userspaceUdp',
  kernel_direct: 'flow.kernelDirect',
  kernel_block: 'flow.kernelBlock',
  dns_intercept: 'flow.dnsIntercept',
  kernel_bypass: 'flow.kernelBypass'
};
const visibility: Record<string, Key> = {full: 'flow.full', partial: 'flow.partialVisibility', none: 'ui.none', unknown: 'ui.unknown'};
const stages: Record<string, Key> = {
  input: 'flow.stage.input',
  route: 'flow.stage.route',
  dial_mode: 'flow.stage.dialMode',
  dns: 'flow.stage.dns',
  outbound: 'flow.stage.outbound',
  connection: 'flow.stage.connection',
  datapath: 'flow.stage.datapath',
  reroute: 'flow.stage.reroute'
};
const traceStates: Record<string, Key> = {complete: 'flow.status.complete', partial: 'flow.status.partial', disabled: 'flow.status.disabled'};
export function Flows({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
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
          {t('flow.loadFailed', {error: resource.error.message})}
        </p>
      )}
      {resource.loading && !resource.data && <p role="status">{t('ui.loading')}</p>}
      <div className="rp-toolbar">
        <Segmented
          label={t('ui.network')}
          value={network}
          onChange={setNetwork}
          items={[
            ['all', t('ui.all')],
            ['tcp', t('ui.tcp')],
            ['udp', t('ui.udp')]
          ]}
        />
        <LabeledSelect
          label={t('ui.state')}
          side
          value={state}
          onChange={setState}
          items={[{id: 'all', label: t('flow.allStates')}, ...Object.entries(connectionStates).map(([id, key]) => ({id, label: t(key)}))]}
        />
      </div>
      <div className="rp-toolbar" aria-label={t('flow.coverage')}>
        {resource.data &&
          Object.entries(resource.data.coverage).map(([scope, value]) => (
            <Badge key={scope} tone={value === 'full' ? undefined : 'warn'}>
              {t('ui.valuePair', {label: coverageLabels[scope] ? t(coverageLabels[scope]) : scope, value: t(visibility[value])})}
            </Badge>
          ))}
      </div>
      <DataTable
        label={t('nav.flows')}
        rows={shown}
        height={250}
        selected={id}
        onSelect={value => value && go('flows', 'id=' + encodeURIComponent(value))}
        empty={t('flow.empty')}
        cols={[
          {id: 'id', label: t('nav.flows'), width: 140, isRowHeader: true},
          {id: 'target', label: t('ui.target'), width: 180},
          {id: 'chain', label: t('conn.chain'), width: 180},
          {id: 'rule', label: t('conn.rule'), width: 220},
          {id: 'network', label: t('ui.protocol'), width: 80},
          {id: 'state', label: t('ui.state'), width: 100},
          {id: 'started', label: t('ui.started'), width: 104}
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
          t(connectionStates[f.state]),
          relativeStart(f.started_at, locale)
        ]}
      />
      {detail.error && (
        <p role="alert" className="rp-note">
          {t('flow.detailFailed', {error: detail.error.message})}
        </p>
      )}
      {detail.loading && !flow && id && <p role="status">{t('flow.detailLoading')}</p>}
      {flow && (
        <section className="rp-card" aria-label={t('flow.trace')}>
          <div className="rp-row">
            <h3 className="rp-h3">{flow.id}</h3>
            <Badge>{t(traceStates[flow.trace.status])}</Badge>
            <span className="rp-label">{t('flow.revision', {n: flow.revision})}</span>
          </div>
          <p className="rp-note">
            {flow.trace.status === 'partial' ? t('flow.partial') : flow.trace.status === 'disabled' ? t('flow.disabled') : t('flow.complete')}
          </p>
          <Kv
            items={[
              [
                t('flow.missing'),
                formatList(
                  lang,
                  flow.trace.missing.map(stage => (stages[stage] ? t(stages[stage]) : stage))
                ) || '—'
              ],
              [t('nav.connections'), flow.connection_id ?? '—'],
              [t('ui.state'), t(connectionStates[flow.state])]
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
                      <Badge>{stages[step.stage] ? t(stages[step.stage]) : step.stage}</Badge>
                      <span className="rp-code">{t('flow.sequence', {n: step.seq})}</span>
                      <time dateTime={step.observed_at ?? undefined}>{localTime(step.observed_at, locale)}</time>
                      <span className="rp-label">{t('ui.microseconds', {n: step.elapsed_us ?? '—'})}</span>
                    </div>
                    {fields ? (
                      <Kv
                        items={fields.map(([key, value]) => [
                          typeof key === 'string' ? t(key) : t(key.key, key.params),
                          typeof value === 'string' ? value : t(value.key, value.params)
                        ])}
                      />
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
