import {useT, useLang, LOCALE, formatList} from '../../i18n';
import {localTime} from '../../api/selectors';
import {useState} from 'react';
import {useCapabilities, useConfigRules, useRoutingTrace} from '../../api/store';
import {runtime} from '../clash-compat/fixtures';
import {Button, DataTable, Kv, LabeledSelect, TextField, ModalDialog, toast} from '../../ui/ui';
import {RuleDialog} from '../activity/RuleDialog';
import type {PageProps} from '../types';
import {RuleDistribution} from './RuleDistribution';

export function Rules({go}: PageProps) {
  const t = useT();
  const lang = useLang();
  const trace = useRoutingTrace();
  const {form, setForm} = trace;
  const config = useConfigRules();
  const capabilities = useCapabilities();
  const [sel, setSel] = useState<string | null>('r4');
  const cur = config?.rules.find(r => r.id === sel);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('rule.note')}</p>
      <form
        className="rp-card"
        onSubmit={e => {
          e.preventDefault();
          void trace.submit();
        }}
      >
        <div className="rp-trace-form">
          <LabeledSelect
            label={t('ui.network')}
            value={form.network}
            onChange={network => setForm({...form, network: network as 'tcp' | 'udp'})}
            items={[
              {id: 'tcp', label: t('ui.tcp')},
              {id: 'udp', label: t('ui.udp')}
            ]}
          />
          <TextField label={t('ui.domain')} value={form.domain} onChange={domain => setForm({...form, domain})} />
          <TextField label={t('ui.destinationIp')} value={form.dst_ip} onChange={dst_ip => setForm({...form, dst_ip})} />
          <TextField label={t('rule.dstPort')} value={form.dst_port} onChange={dst_port => setForm({...form, dst_port})} />
          <TextField label={t('ui.sourceIp')} value={form.src_ip} onChange={src_ip => setForm({...form, src_ip})} />
          <TextField label={t('rule.srcPort')} value={form.src_port} onChange={src_port => setForm({...form, src_port})} />
          <TextField label={t('ui.process')} value={form.pname} onChange={pname => setForm({...form, pname})} />
          <LabeledSelect
            label={t('rule.resolve')}
            value={form.resolve}
            onChange={resolve => setForm({...form, resolve: resolve as 'none' | 'live'})}
            items={trace.modes.map(id => ({id, label: id === 'none' ? t('rule.resolveNone') : t('rule.resolveLive')}))}
          />
        </div>
        {trace.invalid && <p className="rp-note">{t(trace.invalid)}</p>}
        {!trace.available && <p className="rp-note">{t('rule.unavailable')}</p>}
        <Button
          accent
          isDisabled={trace.busy || !!trace.invalid || !trace.available || !trace.modes.includes(form.resolve)}
          onPress={() => void trace.submit()}
        >
          {trace.busy ? t('rule.tracing') : t('rule.trace')}
        </Button>
      </form>
      {trace.error && <p role="alert">{trace.error.message}</p>}
      {trace.result && (
        <section className="rp-col" aria-label={t('rule.result')}>
          <Kv
            items={[
              [t('rule.mode'), trace.result.mode],
              [t('rule.instance'), trace.result.instance_id],
              [t('ui.generation'), trace.result.generation_id],
              [t('rule.observed'), localTime(trace.result.observed_at, LOCALE[lang])]
            ]}
          />
          {trace.result.evaluations.map((evaluation, i) => (
            <section className="rp-card" key={i}>
              <h3 className="rp-h3">{evaluation.dst_ip ?? t('ui.domain')}</h3>
              <Kv
                items={[
                  [t('rule.decision'), evaluation.decision],
                  [t('ui.outbound'), evaluation.outbound ?? '—'],
                  [t('rule.missing'), formatList(lang, evaluation.missing_inputs) || t('ui.none')]
                ]}
              />
              <DataTable
                label={t('rule.evaluation', {n: i + 1})}
                height={400}
                rows={evaluation.rules.map(rule => ({...rule, id: rule.rule_id}))}
                cols={[
                  {id: 'id', label: t('rule.id'), width: 90, isRowHeader: true},
                  {id: 'expression', label: t('rule.expression')},
                  {id: 'result', label: t('rule.outcome'), width: 180},
                  {id: 'missing', label: t('rule.missing'), width: 150}
                ]}
                render={rule => [
                  rule.rule_id,
                  <span className="rp-code">{rule.expression ?? '—'}</span>,
                  <span className={'rp-light rp-trace-result ' + rule.result}>{rule.result}</span>,
                  formatList(lang, rule.missing_inputs) || '—'
                ]}
              />
            </section>
          ))}
          {trace.result.dns.map(dns => (
            <section className="rp-card" key={dns.lookup_id}>
              <h3 className="rp-h3">DNS · {dns.name}</h3>
              <Kv
                items={[
                  [t('ui.type'), dns.qtype],
                  [t('ui.state'), dns.status],
                  [t('ui.source'), dns.source],
                  [t('ui.cache'), dns.cache],
                  [t('rule.address'), formatList(lang, dns.addresses) || '—'],
                  [t('ui.error'), dns.error ?? '—']
                ]}
              />
            </section>
          ))}
        </section>
      )}
      {capabilities.data?.resources.flows.available && <RuleDistribution />}
      {config && (
        <section className="rp-col">
          <h2 className="rp-h3">{t('rule.configTitle')}</h2>
          <div className="rp-split">
            <div className="rp-list">
              <DataTable
                label={t('rule.configRules')}
                rows={config.rules}
                selected={sel}
                onSelect={setSel}
                cols={[
                  {id: 'n', label: '#', width: 56, align: 'end'},
                  {id: 'c', label: t('rule.condition'), isRowHeader: true},
                  {id: 'o', label: t('ui.target'), width: 88},
                  {id: 'm', label: 'must', width: 80},
                  {id: 's', label: t('ui.source'), width: 130},
                  {id: 'x', label: t('rule.comment'), width: 80}
                ]}
                render={r => [
                  r.n,
                  <span className="rp-code">{r.cond}</span>,
                  r.target,
                  r.must ? 'must' : '',
                  r.generated ? t('rule.generated') : r.source,
                  r.note
                ]}
              />
              <div className="rp-fb">
                <span className="rp-kw">fallback</span>: <span className="rp-out">{config.fallback.target}</span>
                <span className="rp-label">{t('rule.editFallback', {source: config.fallback.source})}</span>
              </div>
            </div>
            <div className="rp-card">
              {cur ? (
                <>
                  <h3 className="rp-h3">
                    #{cur.n} {cur.target}
                    {cur.must ? '(must)' : ''}
                  </h3>
                  <span className="rp-code">{cur.cond}</span>
                  <Kv
                    items={[
                      [t('ui.source'), cur.generated ? t('rule.generatedPolicy') : cur.source],
                      [t('ui.state'), cur.editable ? t('ui.editable') : t('ui.readonly')],
                      [t('ui.generation'), config.generation_id]
                    ]}
                  />
                  <div className="rp-col">
                    <div className="rp-group-btns">
                      <Button
                        onPress={() => go('config', 'src=' + cur.source.split(':')[0] + '&line=' + cur.source.split(':')[1])}
                        isDisabled={!cur.editable}
                        secondary
                      >
                        {t('ui.openSource')}
                      </Button>
                      <ModalDialog
                        alert
                        trigger={
                          <Button negative isDisabled={!cur.editable}>
                            {t('ui.delete')}
                          </Button>
                        }
                        title={t('rule.deleteTitle', {n: cur.n})}
                        narrow
                        footer={close => (
                          <>
                            <Button secondary onPress={close}>
                              {t('ui.cancel')}
                            </Button>
                            <Button
                              negative
                              onPress={() => {
                                close();
                                toast('positive', t('rule.deleted', {n: cur.n, revision: runtime.diskRevision + 1}));
                              }}
                            >
                              {t('rule.deleteReload')}
                            </Button>
                          </>
                        )}
                      >
                        <p className="rp-note">
                          {t('rule.deleteNote', {source: cur.source, condition: cur.cond, target: cur.target, revision: runtime.diskRevision})}
                        </p>
                      </ModalDialog>
                    </div>
                    <RuleDialog
                      trigger={<Button accent>{t('ui.addRule')}</Button>}
                      presets={[{label: t('rule.custom'), cond: 'domain(suffix: example.com)'}]}
                    />
                  </div>
                </>
              ) : (
                <span className="rp-label">{t('rule.pick')}</span>
              )}
              <span className="rp-label">{t('rule.noCounts')}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
