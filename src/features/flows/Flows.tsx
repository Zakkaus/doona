import {useMemo, useState} from 'react';
import {useCapabilities, useFlow, useFlows, useGroups, useNodes, useOutboundNames, useRules} from '../../api/store';
import {flowsThrough, nodeNames, pinnedLabel, routingTree} from './map';
import Tree from './Tree';
import {chainLabel, connectionStates, localTime, outboundLabel, relativeStart} from '../../api/selectors';
import {flowStepFields, traceGaps} from './view';
import {
  Badge,
  Button,
  DataTable,
  DetailPanel,
  ErrorMessage,
  Loading,
  TextTooltip,
  Kv,
  LabeledSelect,
  Segmented,
  panelQuery,
  useMediaQuery,
  RuleRef,
  Empty,
  Link
} from '../../ui/ui';
import {Coverage} from './Coverage';
import type {PageProps} from '../types';
import {buildHash, within} from '../../shell/route';
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

export function RoutingMap({go, query}: PageProps) {
  const t = useT();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const resource = useFlows(undefined);
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const rules = useRules(resources?.rules.available === true);
  const tree = useMemo(
    () => routingTree(resource.data?.flows ?? [], groups.data ?? [], nodes.data ?? [], rules.data?.rules ?? []),
    [resource.data, groups.data, nodes.data, rules.data]
  );
  const pinned = params.get('path');
  const setPinned = (value: string | null) => go('rules', within(query, {path: value}));
  const pinnedCount = pinned ? flowsThrough(resource.data?.flows ?? [], pinned, nodeNames(nodes.data ?? [])).length : 0;
  return (
    <section className="rp-col" aria-label={t('flow.map')}>
      <ErrorMessage
        error={resource.error ?? groups.error ?? nodes.error ?? rules.error}
        onRetry={() => {
          resource.refetch();
          groups.refetch();
          nodes.refetch();
          rules.refetch();
        }}
      />
      <section className="rp-card rp-topology" aria-label={t('flow.topology')}>
        <h2 className="rp-label">{t('flow.topology')}</h2>
        {!resource.data && !rules.data && !groups.data ? (
          resource.error ? null : (
            <Loading />
          )
        ) : !tree.rules.length && !tree.outbounds.length ? (
          <Empty>{t('flow.mapEmpty')}</Empty>
        ) : (
          <Tree tree={tree} pinned={pinned} onPin={setPinned} />
        )}
      </section>
      {pinned && (
        <div className="rp-toolbar">
          <Button small onPress={() => go('rules', within(query, {tab: 'flows'}))}>
            {t('flow.viewPinned', {n: pinnedCount})}
          </Button>
          <Button small quiet onPress={() => setPinned(null)}>
            {t('flow.clearMapFilter')}
          </Button>
        </div>
      )}
    </section>
  );
}

export function FlowRecords({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const [network, setNetwork] = useState('all');
  const [state, setState] = useState('all');
  const wide = useMediaQuery(panelQuery);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const connectionId = params.get('connection_id') ?? undefined;
  const resource = useFlows(connectionId);
  const rulesListed = useCapabilities().data?.resources.rules.available === true;
  const rules = useRules(rulesListed);
  const names = useOutboundNames();
  const id = params.get('id');
  const detail = useFlow(id);
  const flow = detail.data;
  // The panel stays for a record still loading or one that failed, so the error and its retry have a place.
  const panelOpen = !!id && (!!flow || detail.loading || !!detail.error);
  const select = (value: string | null) => go('rules', within(query, {id: value}));
  const pinned = params.get('path');
  const setPinned = (value: string | null) => go('rules', within(query, {path: value}));
  const all = resource.data?.flows ?? [];
  const shown = (pinned ? flowsThrough(all, pinned, names) : all).filter(
    f => (network === 'all' || f.network === network) && (state === 'all' || f.state === state)
  );
  return (
    <>
      {resource.error && <ErrorMessage error={resource.error} />}
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
            {t('flow.mapFilter', {label: pinnedLabel(pinned, rules.data?.rules ?? [], names, name => outboundLabel(name, t))})}
            <Close />
          </Button>
        )}
        {connectionId && (
          <Button small label={t('flow.clearConnectionFilter')} onPress={() => go('rules', within(query, {connection_id: null}))}>
            {t('flow.connectionFilter', {id: connectionId})}
            <Close />
          </Button>
        )}
        {resource.data && <Coverage data={resource.data} />}
      </div>
      <div className="rp-with-panel" data-open={panelOpen ? '' : undefined}>
        <DataTable
          label={t('rule.flows')}
          loading={resource.loading && !resource.data}
          rows={shown}
          height={442}
          selected={id}
          onSelect={select}
          selectOnFocus={wide}
          empty={t('flow.empty')}
          cols={[
            {
              id: 'target',
              label: t('ui.target'),
              minWidth: 128,
              grow: 2,
              isRowHeader: true,
              render: f => <TextTooltip>{f.input?.domain || f.input?.dst || f.id}</TextTooltip>
            },
            {
              id: 'chain',
              label: t('conn.chain'),
              minWidth: 96,
              drop: 2,
              render: f => <TextTooltip className="rp-chain">{chainLabel(f, t, names)}</TextTooltip>
            },
            {
              id: 'rule',
              label: t('conn.rule'),
              minWidth: 152,
              grow: 2,
              drop: 1,
              render: f => (
                <span className="rp-rule">
                  <RuleRef expression={f.rule_expression} ruleId={f.rule_id} linked={rulesListed} />
                  {f.rule_source === 'recomputed' && <small className="rp-provenance">{t('conn.recomputed')}</small>}
                </span>
              )
            },
            {id: 'network', label: t('ui.protocol'), minWidth: 64, grow: 0, drop: 3, render: f => f.network.toUpperCase()},
            {id: 'state', label: t('ui.state'), minWidth: 80, grow: 0, drop: 5, render: f => t(connectionStates[f.state])},
            {id: 'started', label: t('ui.started'), minWidth: 80, grow: 0, drop: 4, render: f => relativeStart(f.started_at, locale)}
          ]}
        />
        <DetailPanel open={panelOpen} title={flow?.input?.domain || flow?.input?.dst || flow?.id || id || ''} onClose={() => select(null)}>
          {detail.error && <ErrorMessage error={detail.error} onRetry={detail.refetch} />}
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
                            flow.trace.missing.map(gap => (traceGaps[gap] ? t(traceGaps[gap]) : gap))
                          )
                        ] as [string, string]
                      ]
                    : [])
                ]}
              />
              {flow.connection_id && (
                <Link appearance="button" className="sm" href={buildHash('connections', 'id=' + encodeURIComponent(flow.connection_id))}>
                  {t('flow.viewConnection')}
                </Link>
              )}
              <div className="rp-list">
                {!flow.trace.steps.length && <Empty>{t('ui.empty')}</Empty>}
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
                          <pre className="rp-flow-raw rp-code">
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
    </>
  );
}
