import {OutboundTag} from '../shared/OutboundTag';
import '../../ui/styles/routing.css';
import {useLayoutEffect, useMemo, useRef} from 'react';
import Tree from './Tree';
import {NodeName} from '../../ui/NodeName';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DetailPanel,
  ErrorMessage,
  Loading,
  TextTooltip,
  TimeCell,
  Kv,
  LabeledSelect,
  Segmented,
  RuleRef,
  Empty,
  Link,
  Tabs,
  type TableColumn,
  Toolbar
} from '../../ui/ui';
import {Coverage} from '../shared/Coverage';
import type {PageProps} from '../../shell/routes';
import {useT} from '../../i18n';
import Close from '../../ui/icons/Close';
import {useRoutingMap} from './useRoutingMap';
import {useFlowRecords} from './useFlowRecords';
import {ruleHref} from '../shared/link';
import {QuickRuleButton, RuleDialog} from '../shared/RuleDialog';
import {useFlowsPage} from './useFlowsPage';

type FlowRow = ReturnType<typeof useFlowRecords>['rows'][number];

export function Flows(props: PageProps) {
  const t = useT();
  const view = useFlowsPage(props);
  const content = {map: <RoutingMap {...props} />, records: <FlowRecords {...props} />};
  if (view.loading) return <Loading />;
  if (view.error) return <ErrorMessage error={view.error} onRetry={view.retry} />;
  return (
    <div className="rp-page">
      <Tabs page label={t('nav.flows')} items={view.tabs.map(tab => ({...tab, content: content[tab.id]}))} value={view.tab} onChange={view.changeTab} />
    </div>
  );
}

function RoutingMap(props: PageProps) {
  const t = useT();
  const view = useRoutingMap(props);
  return (
    <section className="rp-col" aria-label={t('flow.map')}>
      <Toolbar page>
        {view.pinLabel ? <Button onPress={view.viewPinned}>{view.pinLabel}</Button> : <span className="rp-label">{t('flow.mapFilterHint')}</span>}
        <span className="rp-grow" />
        <Button quiet isDisabled={!view.pinLabel} onPress={() => view.pin(null)}>
          {t('flow.clearMapFilter')}
        </Button>
      </Toolbar>
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <Card
        title={t('flow.topology')}
        note={t('flow.topologyNote')}
        className="rp-topology"
        aside={
          <Segmented
            label={t('flow.topology')}
            value={view.by}
            onChange={view.changeBy}
            items={[
              ['rule', t('flow.byRule')],
              ['client', t('conn.byClient')]
            ]}
          />
        }
      >
        {view.state === 'loading' && <Loading />}
        {view.state === 'empty' && <Empty>{t('flow.mapEmpty')}</Empty>}
        {view.state === 'ready' && (
          <>
            <span className="rp-tree-hint">{t('flow.treePanHint')}</span>
            <Tree tree={view.tree} pinned={view.pinned} onPin={view.pin} />
          </>
        )}
      </Card>
    </section>
  );
}

function FlowRecords(props: PageProps) {
  const t = useT();
  const view = useFlowRecords(props);
  const detail = view.detail;
  const latest = useRef(view.rule);
  useLayoutEffect(() => {
    latest.current = view.rule;
  });
  // Stable column definitions: a new array on every poll would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<FlowRow>[] => [
      {id: 'target', label: t('ui.target'), minWidth: 128, grow: 2, isRowHeader: true, render: row => <TextTooltip>{row.target}</TextTooltip>},
      {
        id: 'node',
        label: t('nodes.node'),
        minWidth: 96,
        drop: 2,
        render: row =>
          row.nodeName ? (
            <NodeName name={row.node} className="rp-chain" text={row.path ?? undefined} />
          ) : (
            <TextTooltip className="rp-chain" text={row.path ?? undefined}>
              {row.node}
            </TextTooltip>
          )
      },
      {
        id: 'rule',
        label: t('ui.rule'),
        minWidth: 152,
        grow: 2,
        drop: 1,
        render: row => (
          <span className="rp-rule">
            <RuleRef expression={row.expression} href={ruleHref(row.ruleId, view.rulesListed)} />
            {row.recomputed && <Badge>{t('conn.recomputed')}</Badge>}
          </span>
        )
      },
      {id: 'network', label: t('ui.protocol'), minWidth: 64, grow: 0, drop: 3, render: row => row.network},
      {id: 'state', label: t('ui.state'), minWidth: 112, grow: 0, drop: 5, render: row => row.state},
      {id: 'started', label: t('ui.started'), minWidth: 140, grow: 0, drop: 4, render: row => <TimeCell at={row.startedAt} />},
      {
        id: 'actions',
        actions: true,
        label: t('ui.actions'),
        minWidth: 88,
        grow: 0,
        render: row => {
          const action = latest.current;
          const disabled = !action.canAdd(row.seed);
          return <QuickRuleButton label={action.label(row.target)} disabled={disabled} tip={action.noTarget} onPress={() => latest.current.open(row.seed)} />;
        }
      }
    ],
    [t, view.rulesListed]
  );
  return (
    <>
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <Toolbar page>
        <Segmented
          label={t('ui.network')}
          value={view.network}
          onChange={view.setNetwork}
          items={[
            ['all', t('ui.all')],
            ['tcp', t('ui.tcp')],
            ['udp', t('ui.udp')]
          ]}
        />
        <LabeledSelect label={t('ui.state')} side value={view.state} onChange={view.setState} items={view.stateOptions} />
        {view.pinLabel && (
          <Button label={t('ui.valuePair', {label: t('flow.clearMapFilter'), value: view.pinLabel})} onPress={view.clearPin}>
            {view.pinLabel}
            <Close />
          </Button>
        )}
        {view.connectionLabel && (
          <Button label={t('ui.valuePair', {label: t('flow.clearConnectionFilter'), value: view.connectionLabel})} onPress={view.clearConnection}>
            {view.connectionLabel}
            <Close />
          </Button>
        )}
        {view.coverage && <Coverage view={view.coverage} />}
        {view.recordingHref && (
          <>
            <span className="rp-grow" />
            <Link appearance="button" quiet href={view.recordingHref}>
              {t('ui.recordingSettings')}
            </Link>
          </>
        )}
      </Toolbar>
      <div className="rp-with-panel" data-open={view.panelOpen ? '' : undefined}>
        <DataTable
          label={t('flow.records')}
          rowDetail
          loading={view.loading}
          rows={view.rows}
          height={442}
          selected={view.id}
          onSelect={view.select}
          selectOnFocus={view.wide}
          empty={t('flow.empty')}
          cols={columns}
        />
        <DetailPanel open={view.panelOpen} title={view.panelTitle} onClose={() => view.select(null)}>
          <ErrorMessage error={view.detailError} onRetry={view.detailRetry} />
          {view.detailLoading && <Loading>{t('flow.detailLoading')}</Loading>}
          {detail && (
            <>
              <div className="rp-cluster">
                <Badge tone={detail.tone}>{detail.status}</Badge>
                <span className="rp-label">{detail.revision}</span>
              </div>
              <Kv inline items={[[t('ui.outbound'), <OutboundTag {...detail.outboundTag} />], ...detail.fields]} />
              <div className="rp-cluster">
                {detail.connectionHref && (
                  <Link appearance="button" small href={detail.connectionHref}>
                    {t('flow.viewConnection')}
                  </Link>
                )}
              </div>
              <div className="rp-list">
                {!detail.steps.length && <Empty>{t('ui.empty')}</Empty>}
                {detail.steps.map(step => (
                  <div key={step.id} className="rp-col rp-step">
                    <div className="rp-cluster">
                      <Badge>{step.stage}</Badge>
                      <TextTooltip text={step.observed} className="rp-label">
                        {step.elapsed}
                      </TextTooltip>
                    </div>
                    {step.fields ? (
                      <Kv inline items={step.fields} />
                    ) : (
                      <pre className="rp-flow-raw rp-code">
                        <code>{step.raw}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </DetailPanel>
      </div>
      <RuleDialog dialog={view.rule.dialog} />
    </>
  );
}
