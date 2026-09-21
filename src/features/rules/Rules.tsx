import {useT} from '../../i18n';
import {useRoutingTrace, type TraceResolve} from './useRoutingTrace';
import {Button, DataTable, Disclosure, ErrorMessage, Loading, TextTooltip, Kv, LabeledSelect, Light, Tabs, TextField} from '../../ui/ui';
import {RuleList} from './RuleList';
import {FlowRecords, RoutingMap} from '../flows/Flows';
import type {PageProps} from '../types';
import {useRulesPage} from './useRulesPage';

export function Rules(props: PageProps) {
  const t = useT();
  const view = useRulesPage(props);
  const content = {map: <RoutingMap {...props} />, list: <RuleList {...props} />, flows: <FlowRecords {...props} />, trace: <Trace />};
  if (view.loading) return <Loading />;
  if (view.error) return <ErrorMessage error={view.error} />;
  return (
    <div className="rp-page">
      <Tabs label={t('nav.rules')} items={view.tabs.map(tab => ({...tab, content: content[tab.id]}))} value={view.tab} onChange={view.changeTab} />
    </div>
  );
}

function Trace() {
  const t = useT();
  const trace = useRoutingTrace();
  const {form, setForm} = trace;
  return (
    <>
      <form
        className="rp-card"
        onSubmit={event => {
          event.preventDefault();
          void trace.submit();
        }}
      >
        <div className="rp-toolbar top">
          <LabeledSelect
            label={t('ui.network')}
            value={form.network}
            onChange={network => setForm({...form, network: network as 'tcp' | 'udp'})}
            items={[
              {id: 'tcp', label: t('ui.tcp')},
              {id: 'udp', label: t('ui.udp')}
            ]}
          />
          <TextField label={t('ui.domain')} value={form.domain} onChange={domain => setForm({...form, domain})} error={trace.errors.domain} />
          <TextField label={t('ui.destinationIp')} value={form.dst_ip} onChange={dst_ip => setForm({...form, dst_ip})} error={trace.errors.dst_ip} />
          <TextField label={t('rule.dstPort')} value={form.dst_port} onChange={dst_port => setForm({...form, dst_port})} error={trace.errors.dst_port} />
          <LabeledSelect
            label={t('rule.resolve')}
            value={trace.resolve}
            onChange={resolve => setForm({...form, resolve: resolve as TraceResolve})}
            items={trace.modes}
          />
          <Button accent className="rp-btn rp-field-row" isPending={trace.busy} isDisabled={!trace.canSubmit} type="submit">
            {t('rule.run')}
          </Button>
        </div>
        <Disclosure id="rules-trace-advanced" title={t('rule.advanced')} isExpanded={trace.advanced} onExpandedChange={trace.setAdvanced}>
          <div className="rp-toolbar">
            <TextField label={t('ui.sourceIp')} value={form.src_ip} onChange={src_ip => setForm({...form, src_ip})} />
            <TextField label={t('rule.srcPort')} value={form.src_port} onChange={src_port => setForm({...form, src_port})} error={trace.errors.src_port} />
            <TextField label={t('ui.process')} value={form.pname} onChange={pname => setForm({...form, pname})} />
          </div>
        </Disclosure>
        {trace.ipOnly && <span className="rp-label">{t('rule.ipOnly')}</span>}
        {!trace.available && <span className="rp-label">{t('rule.unavailable')}</span>}
      </form>
      {trace.result && (
        <section className="rp-col" aria-label={t('rule.result')}>
          <div className="rp-toolbar">
            <TextTooltip text={t('rule.note')} className="rp-label">
              {trace.result.status}
            </TextTooltip>
          </div>
          {trace.result.evaluations.map((evaluation, i) => (
            <section className="rp-card" key={i}>
              <div className="rp-row">
                <h3 className="rp-h3">{evaluation.heading}</h3>
                <Kv inline items={evaluation.fields} />
                {evaluation.probe && (
                  <Button
                    small
                    isPending={evaluation.probe.pending}
                    isDisabled={evaluation.probe.disabled}
                    onPress={() => void trace.probeNode(evaluation.probe!.id)}
                  >
                    {evaluation.probe.label}
                  </Button>
                )}
              </div>
              {evaluation.hint && <p className="rp-label">{evaluation.hint}</p>}
              <DataTable
                label={evaluation.label}
                height={360}
                rows={evaluation.rows}
                cols={[
                  {
                    id: 'expression',
                    label: t('rule.expression'),
                    minWidth: 240,
                    grow: 2,
                    isRowHeader: true,
                    render: row => (
                      <TextTooltip className="rp-code" text={row.id}>
                        {row.expression}
                      </TextTooltip>
                    )
                  },
                  {
                    id: 'result',
                    label: t('rule.outcome'),
                    minWidth: 120,
                    grow: 0,
                    render: row => (
                      <Light small tone={row.tone}>
                        {row.outcome}
                      </Light>
                    )
                  },
                  {id: 'missing', label: t('rule.missing'), minWidth: 144, render: row => row.missing}
                ]}
              />
            </section>
          ))}
          {trace.result.dns.map(dns => (
            <section className="rp-card" key={dns.id}>
              <h3 className="rp-h3">{dns.heading}</h3>
              <Kv inline items={dns.fields} />
            </section>
          ))}
        </section>
      )}
    </>
  );
}
