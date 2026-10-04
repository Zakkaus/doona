import {useMemo} from 'react';
import {useT} from '../../i18n';
import {useRoutingTrace, useTraceForm, type TraceResolve} from './useRoutingTrace';
import {
  ActionHelp,
  Button,
  Card,
  cardClass,
  DataTable,
  Disclosure,
  ErrorMessage,
  Loading,
  TextTooltip,
  Kv,
  LabeledSelect,
  Link,
  Light,
  RuleRef,
  NumberField,
  numberFromText,
  textFromNumber,
  Tabs,
  TextField,
  type TableColumn,
  Toolbar,
  Form
} from '../../ui/ui';
import {RuleList} from './RuleList';
import {RuleDialog} from '../shared/RuleDialog';
import {DnsRules} from './DnsRules';
import type {PageProps} from '../../shell/routes';
import {useRulesPage} from './useRulesPage';
import type {EvaluationView, ResultLink} from './view';

export function Rules(props: PageProps) {
  const t = useT();
  const view = useRulesPage(props);
  const traceForm = useTraceForm(props.query);
  const content = {
    list: <RuleList {...props} />,
    dns: <DnsRules {...props} />,
    trace: <Trace form={traceForm} go={props.go} />
  };
  if (view.loading) return <Loading />;
  if (view.error) return <ErrorMessage error={view.error} onRetry={view.retry} />;
  return (
    <div className="rp-page">
      <Tabs page label={t('nav.rules')} items={view.tabs.map(tab => ({...tab, content: content[tab.id]}))} value={view.tab} onChange={view.changeTab} />
    </div>
  );
}

function Trace({form: state, go}: {form: ReturnType<typeof useTraceForm>; go: PageProps['go']}) {
  const t = useT();
  const trace = useRoutingTrace(state, go);
  const {form, setForm} = trace;
  // Stable columns: an inline array would re-render every rule row of every result card on each keystroke.
  const columns = useMemo(
    (): TableColumn<EvaluationView['rows'][number]>[] => [
      {
        id: 'expression',
        label: t('rule.expression'),
        minWidth: 240,
        grow: 2,
        isRowHeader: true,
        render: row => (
          <span className="rp-rule">
            <RuleRef className="rp-code" expression={row.expression} tooltip={row.id} href={row.href} />
          </span>
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
    ],
    [t]
  );
  return (
    <>
      <Form
        className={cardClass()}
        onSubmit={event => {
          event.preventDefault();
          void trace.submit();
        }}
      >
        <ActionHelp reason={trace.reason}>
          <Toolbar className="top">
            <LabeledSelect
              label={t('ui.network')}
              value={form.network}
              onChange={network => setForm({...form, network: network as 'tcp' | 'udp'})}
              items={[
                {id: 'tcp', label: t('ui.tcp')},
                {id: 'udp', label: t('ui.udp')}
              ]}
            />
            <TextField
              label={t('ui.domain')}
              value={form.domain}
              placeholder="example.com"
              onChange={domain => setForm({...form, domain})}
              error={trace.errors.domain}
            />
            <TextField label={t('ui.destinationIp')} value={form.dst_ip} onChange={dst_ip => setForm({...form, dst_ip})} error={trace.errors.dst_ip} />
            <NumberField
              label={t('rule.kind.dport')}
              value={numberFromText(form.dst_port)}
              minValue={1}
              maxValue={65535}
              placeholder="443"
              onChange={value => setForm({...form, dst_port: textFromNumber(value)})}
              error={trace.errors.dst_port}
            />
            <LabeledSelect
              label={t('rule.resolve')}
              value={trace.resolve}
              onChange={resolve => setForm({...form, resolve: resolve as TraceResolve})}
              items={trace.modes}
            />
            <Button accent className="rp-field-row" isPending={trace.busy} isDisabled={!trace.canSubmit} type="submit">
              {t('rule.run')}
            </Button>
          </Toolbar>
        </ActionHelp>
        <Disclosure id="rules-trace-advanced" title={t('rule.advanced')} isExpanded={trace.advanced} onExpandedChange={trace.setAdvanced}>
          <Toolbar>
            <TextField label={t('ui.sourceIp')} value={form.src_ip} onChange={src_ip => setForm({...form, src_ip})} error={trace.errors.src_ip} />
            <NumberField
              label={t('rule.kind.sport')}
              value={numberFromText(form.src_port)}
              minValue={1}
              maxValue={65535}
              onChange={value => setForm({...form, src_port: textFromNumber(value)})}
              error={trace.errors.src_port}
            />
            <TextField label={t('ui.process')} value={form.pname} onChange={pname => setForm({...form, pname})} />
            <NumberField
              label={t('rule.dscp')}
              value={numberFromText(form.dscp)}
              minValue={0}
              maxValue={63}
              onChange={value => setForm({...form, dscp: textFromNumber(value)})}
              error={trace.errors.dscp}
            />
          </Toolbar>
        </Disclosure>
        {trace.ipOnly && <span className="rp-label">{t('rule.ipOnly')}</span>}
      </Form>
      {trace.result && (
        <section className="rp-col" aria-label={t('rule.result')}>
          <Toolbar>
            <TextTooltip text={t('rule.note')} className="rp-label">
              {trace.result.status}
            </TextTooltip>
          </Toolbar>
          {trace.result.query && (
            <Card>
              <div className="rp-row">
                <h2 className="rp-h3">{trace.result.query.heading}</h2>
                <ResultLinks links={trace.result.query.links} />
              </div>
              <Kv inline items={trace.result.query.fields} />
            </Card>
          )}
          {trace.result.evaluations.map((evaluation, i) => (
            <Card key={i}>
              <div className="rp-row">
                <h2 className="rp-h3">{evaluation.heading}</h2>
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
                {evaluation.canAdd && (
                  <Button small onPress={() => trace.addRule(i)}>
                    {t('rule.add')}
                  </Button>
                )}
                <ResultLinks links={evaluation.links} />
              </div>
              {evaluation.hint && <p className="rp-label">{evaluation.hint}</p>}
              <DataTable label={evaluation.label} height={360} rows={evaluation.rows} cols={columns} />
            </Card>
          ))}
          {trace.result.dns.map(dns => (
            <Card key={dns.id}>
              <div className="rp-row">
                <h2 className="rp-h3">{dns.heading}</h2>
                <ResultLinks links={dns.links} />
              </div>
              <Kv inline items={dns.fields} />
            </Card>
          ))}
        </section>
      )}
      <RuleDialog dialog={trace.ruleDialog} />
    </>
  );
}

// The groups and node a result card names, or its DNS name, each on its own page.
function ResultLinks({links}: {links: ResultLink[]}) {
  return links.map(link => (
    <Link key={link.id} appearance="button" small href={link.href}>
      {link.label}
    </Link>
  ));
}
