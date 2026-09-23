import {useMemo} from 'react';
import Tree from './Tree';
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
  RuleRef,
  Empty,
  Link,
  type TableColumn
} from '../../../ui/ui';
import {Coverage} from './Coverage';
import type {PageProps} from '../../types';
import {useT} from '../../../i18n';
import Close from '../../../ui/icons/Close';
import {useRoutingMap} from './useRoutingMap';
import {useFlowRecords} from './useFlowRecords';
import {ruleHref} from '../link';

type FlowRow = ReturnType<typeof useFlowRecords>['rows'][number];

export function RoutingMap(props: PageProps) {
  const t = useT();
  const view = useRoutingMap(props);
  return (
    <section className="rp-col" aria-label={t('flow.map')}>
      <ErrorMessage error={view.error} onRetry={view.retry} />
      <section className="rp-card rp-topology" aria-label={t('flow.topology')}>
        <div className="rp-row">
          <h2 className="rp-label">{t('flow.topology')}</h2>
          <Segmented
            label={t('flow.topology')}
            value={view.by}
            onChange={view.changeBy}
            items={[
              ['rule', t('flow.byRule')],
              ['client', t('flow.byClient')]
            ]}
          />
        </div>
        {view.state === 'loading' && <Loading />}
        {view.state === 'empty' && <Empty>{t('flow.mapEmpty')}</Empty>}
        {view.state === 'ready' && <Tree tree={view.tree} pinned={view.pinned} onPin={view.pin} />}
      </section>
      {view.pinLabel && (
        <div className="rp-toolbar">
          <Button small onPress={view.viewPinned}>
            {view.pinLabel}
          </Button>
          <Button small quiet onPress={() => view.pin(null)}>
            {t('flow.clearMapFilter')}
          </Button>
        </div>
      )}
    </section>
  );
}

export function FlowRecords(props: PageProps) {
  const t = useT();
  const view = useFlowRecords(props);
  const detail = view.detail;
  // Stable column definitions: a new array on every poll would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<FlowRow>[] => [
      {id: 'target', label: t('ui.target'), minWidth: 128, grow: 2, isRowHeader: true, render: row => <TextTooltip>{row.target}</TextTooltip>},
      {id: 'chain', label: t('conn.chain'), minWidth: 96, drop: 2, render: row => <TextTooltip className="rp-chain">{row.chain}</TextTooltip>},
      {
        id: 'rule',
        label: t('conn.rule'),
        minWidth: 152,
        grow: 2,
        drop: 1,
        render: row => (
          <span className="rp-rule">
            <RuleRef expression={row.expression} href={ruleHref(row.ruleId, view.rulesListed)} />
            {row.recomputed && <small className="rp-provenance">{t('conn.recomputed')}</small>}
          </span>
        )
      },
      {id: 'network', label: t('ui.protocol'), minWidth: 64, grow: 0, drop: 3, render: row => row.network},
      {id: 'state', label: t('ui.state'), minWidth: 80, grow: 0, drop: 5, render: row => row.state},
      {id: 'started', label: t('ui.started'), minWidth: 80, grow: 0, drop: 4, render: row => row.started}
    ],
    [t, view.rulesListed]
  );
  return (
    <>
      <ErrorMessage error={view.error} />
      <div className="rp-toolbar">
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
          <Button small label={t('ui.valuePair', {label: t('flow.clearMapFilter'), value: view.pinLabel})} onPress={view.clearPin}>
            {view.pinLabel}
            <Close />
          </Button>
        )}
        {view.connectionLabel && (
          <Button small label={t('ui.valuePair', {label: t('flow.clearConnectionFilter'), value: view.connectionLabel})} onPress={view.clearConnection}>
            {view.connectionLabel}
            <Close />
          </Button>
        )}
        {view.coverage && <Coverage view={view.coverage} />}
      </div>
      <div className="rp-with-panel" data-open={view.panelOpen ? '' : undefined}>
        <DataTable
          label={t('rule.flows')}
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
              <Kv inline items={detail.fields} />
              <div className="rp-cluster">
                {detail.connectionHref && (
                  <Link appearance="button" className="sm" href={detail.connectionHref}>
                    {t('flow.viewConnection')}
                  </Link>
                )}
                {detail.seedHref && (
                  <Link appearance="button" className="sm" href={detail.seedHref}>
                    {t('flow.addRule')}
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
    </>
  );
}
