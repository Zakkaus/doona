import {useMemo, useState} from 'react';
import {useFlow, useFlows, useGroups, useNodes} from '../../api/store';
import {FlowMap} from './FlowMap';
import {flowMap, flowsThrough} from './map';
import {chainLabel, connectionStates, flowStepFields, localTime, outboundLabel, relativeStart} from '../../api/selectors';
import {OutboundMark} from '../policies/Flag';
import {Badge, Button, DataTable, DetailPanel, ErrorMessage, Loading, TextTooltip, Kv, LabeledSelect, Segmented, panelQuery, useMediaQuery} from '../../ui/ui';
import {Coverage} from './Coverage';
import type {PageProps} from '../types';
import {useT, useLang, LOCALE, formatList} from '../../i18n';
import type {Key} from '../../i18n/messages';
import Close from '../../ui/icons/Close';

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

// "Which decisions did this traffic go through": a list of retained flows, the trace of the selected one beside it.
export function Flows({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const [network, setNetwork] = useState('all');
  const [state, setState] = useState('all');
  const wide = useMediaQuery(panelQuery);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const connectionId = params.get('connection_id') ?? undefined;
  const resource = useFlows(connectionId);
  const id = params.get('id');
  const detail = useFlow(id);
  const flow = detail.data;
  const select = (value: string | null) => {
    const next = new URLSearchParams(query);
    if (value) next.set('id', value);
    else next.delete('id');
    go('flows', next.toString());
  };
  // The map draws the config with every retained flow; the pinned path narrows the list beneath it.
  const groups = useGroups();
  const nodes = useNodes();
  const map = useMemo(() => flowMap(resource.data?.flows ?? [], groups.data ?? [], nodes.data ?? []), [resource.data, groups.data, nodes.data]);
  const pinned = params.get('path');
  const setPinned = (value: string | null) => {
    const next = new URLSearchParams(query);
    if (value) next.set('path', value);
    else next.delete('path');
    go('flows', next.toString());
  };
  const pinnedLabel = pinned ? (map.nodes.find(node => node.id === pinned)?.label ?? pinned.slice(pinned.indexOf(':') + 1)) : null;
  const all = resource.data?.flows ?? [];
  const shown = (pinned ? flowsThrough(all, pinned) : all).filter(f => (network === 'all' || f.network === network) && (state === 'all' || f.state === state));
  return (
    <div className="rp-page">
      {resource.error && <ErrorMessage error={resource.error} />}
      <section className="rp-col" aria-label={t('flow.map')}>
        {resource.data || groups.data ? (
          <FlowMap map={map} groups={groups.data ?? []} nodes={nodes.data ?? []} pinned={pinned} onPin={setPinned} />
        ) : resource.error || groups.error ? null : (
          <Loading />
        )}
        {resource.data && !resource.data.flows.length && <span className="rp-empty">{t('flow.mapEmpty')}</span>}
      </section>
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
        {pinned && (
          <Button small label={t('flow.clearMapFilter')} onPress={() => setPinned(null)}>
            {t('flow.mapFilter', {label: pinnedLabel ?? ''})}
            <Close />
          </Button>
        )}
        {connectionId && (
          <Button small label={t('flow.clearConnectionFilter')} onPress={() => go('flows', id ? 'id=' + encodeURIComponent(id) : '')}>
            {t('flow.connectionFilter', {id: connectionId})}
            <Close />
          </Button>
        )}
        {resource.data && <Coverage data={resource.data} />}
      </div>
      <div className="rp-with-panel" data-open={flow || (id && detail.loading) ? '' : undefined}>
        <DataTable
          label={t('nav.flows')}
          loading={resource.loading && !resource.data}
          rows={shown}
          height={442}
          selected={id}
          onSelect={select}
          selectOnFocus={wide}
          empty={t('flow.empty')}
          cols={[
            {id: 'target', label: t('ui.target'), minWidth: 128, grow: 2, isRowHeader: true},
            {id: 'chain', label: t('conn.chain'), minWidth: 96, drop: 2},
            {id: 'rule', label: t('conn.rule'), minWidth: 152, grow: 2, drop: 1},
            {id: 'network', label: t('ui.protocol'), minWidth: 64, grow: 0, drop: 3},
            {id: 'state', label: t('ui.state'), minWidth: 80, grow: 0, drop: 5},
            {id: 'started', label: t('ui.started'), minWidth: 80, grow: 0, drop: 4}
          ]}
          render={f => [
            <TextTooltip>{f.input?.domain || f.input?.dst || f.id}</TextTooltip>,
            <span className="rp-chain">
              <OutboundMark name={f.outbound === 'direct' || f.outbound === 'block' ? f.outbound : (f.chain.at(-1) ?? null)} />
              <TextTooltip>{chainLabel(f, t)}</TextTooltip>
            </span>,
            <span className="rp-rule">
              <TextTooltip text={f.rule_expression ?? undefined}>{f.rule_expression ?? '—'}</TextTooltip>
              {f.rule_source === 'recomputed' && <small className="rp-provenance">{t('conn.recomputed')}</small>}
            </span>,
            f.network.toUpperCase(),
            t(connectionStates[f.state]),
            relativeStart(f.started_at, locale)
          ]}
        />
        <DetailPanel
          open={!!flow || (!!id && detail.loading)}
          title={flow?.input?.domain || flow?.input?.dst || flow?.id || id || ''}
          onClose={() => select(null)}
        >
          {detail.error && <ErrorMessage error={detail.error} />}
          {!flow && detail.loading && <Loading>{t('flow.detailLoading')}</Loading>}
          {flow && (
            <>
              <div className="rp-cluster">
                <Badge tone={flow.trace.status === 'complete' ? undefined : 'warn'}>{t(traceStates[flow.trace.status])}</Badge>
                <span className="rp-label">{t('flow.revision', {n: flow.revision})}</span>
              </div>
              <Kv
                inline
                items={[
                  [t('ui.state'), t(connectionStates[flow.state])],
                  [t('ui.outbound'), outboundLabel(flow.outbound, t)],
                  ...(flow.trace.missing.length
                    ? [
                        [
                          t('flow.missing'),
                          formatList(
                            lang,
                            flow.trace.missing.map(stage => (stages[stage] ? t(stages[stage]) : stage))
                          )
                        ] as [string, string]
                      ]
                    : [])
                ]}
              />
              {flow.connection_id && (
                <Button small onPress={() => go('connections', 'id=' + encodeURIComponent(flow.connection_id ?? ''))}>
                  {t('flow.viewConnection')}
                </Button>
              )}
              <div className="rp-list">
                {!flow.trace.steps.length && <div className="rp-empty">{t('ui.empty')}</div>}
                {[...flow.trace.steps]
                  .sort((a, b) => a.seq - b.seq)
                  .map(step => {
                    const fields = flowStepFields(step);
                    return (
                      <div key={step.seq} className="rp-col rp-step">
                        <div className="rp-cluster">
                          <Badge>{stages[step.stage] ? t(stages[step.stage]) : step.stage}</Badge>
                          <TextTooltip text={localTime(step.observed_at, locale)} className="rp-label">
                            {t('ui.microseconds', {n: step.elapsed_us ?? '—'})}
                          </TextTooltip>
                        </div>
                        {fields ? (
                          <Kv
                            inline
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
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </div>
  );
}
