import {useState} from 'react';
import {useConfigRules, useRoutingTrace} from '../../api/store';
import {runtime} from '../clash-compat/fixtures';
import {Button, DataTable, Kv, LabeledSelect, TextField, ModalDialog, toast} from '../../ui/ui';
import {RuleDialog} from '../activity/RuleDialog';
import type {PageProps} from '../types';

export function Rules({go}: PageProps) {
  const trace = useRoutingTrace();
  const {form, setForm} = trace;
  const config = useConfigRules();
  const [sel, setSel] = useState<string | null>('r4');
  const cur = config?.rules.find(r => r.id === sel);
  return (
    <div className="rp-page">
      <p className="rp-note">模擬目前配置的路由結果，不代表實際連線。域名與目的 IP 至少填寫一項；即時解析時，目的 IP 必須留空。</p>
      <form
        className="rp-card"
        onSubmit={e => {
          e.preventDefault();
          void trace.submit();
        }}
      >
        <div className="rp-trace-form">
          <LabeledSelect
            label="網路協定"
            value={form.network}
            onChange={network => setForm({...form, network: network as 'tcp' | 'udp'})}
            items={[
              {id: 'tcp', label: 'TCP'},
              {id: 'udp', label: 'UDP'}
            ]}
          />
          <TextField label="域名" value={form.domain} onChange={domain => setForm({...form, domain})} />
          <TextField label="目的 IP" value={form.dst_ip} onChange={dst_ip => setForm({...form, dst_ip})} />
          <TextField label="目的連接埠" value={form.dst_port} onChange={dst_port => setForm({...form, dst_port})} />
          <TextField label="來源 IP" value={form.src_ip} onChange={src_ip => setForm({...form, src_ip})} />
          <TextField label="來源連接埠" value={form.src_port} onChange={src_port => setForm({...form, src_port})} />
          <TextField label="程序名稱" value={form.pname} onChange={pname => setForm({...form, pname})} />
          <LabeledSelect
            label="解析模式"
            value={form.resolve}
            onChange={resolve => setForm({...form, resolve: resolve as 'none' | 'live'})}
            items={trace.modes.map(id => ({id, label: id === 'none' ? '不解析（none）' : '即時解析（live）'}))}
          />
        </div>
        {trace.invalid && <p className="rp-note">{trace.invalid}</p>}
        {!trace.available && <p className="rp-note">不支援路由追蹤</p>}
        <Button
          accent
          isDisabled={trace.busy || !!trace.invalid || !trace.available || !trace.modes.includes(form.resolve)}
          onPress={() => void trace.submit()}
        >
          {trace.busy ? '追蹤中' : '追蹤'}
        </Button>
      </form>
      {trace.error && <p role="alert">{trace.error.message}</p>}
      {trace.result && (
        <section className="rp-col" aria-label="模擬結果">
          <Kv
            items={[
              ['模式', trace.result.mode],
              ['執行個體', trace.result.instance_id],
              ['世代 ID', trace.result.generation_id],
              ['觀測時間', trace.result.observed_at]
            ]}
          />
          {trace.result.evaluations.map((evaluation, i) => (
            <section className="rp-card" key={i}>
              <h3 className="rp-h3">{evaluation.dst_ip ?? '域名'}</h3>
              <Kv
                items={[
                  ['判定', evaluation.decision],
                  ['出站', evaluation.outbound ?? '—'],
                  ['缺少輸入', evaluation.missing_inputs.join('、') || '無']
                ]}
              />
              <DataTable
                label={'規則評估 ' + (i + 1)}
                height={400}
                rows={evaluation.rules.map(rule => ({...rule, id: rule.rule_id}))}
                cols={[
                  {id: 'id', label: '規則 ID', width: 90, isRowHeader: true},
                  {id: 'expression', label: '運算式'},
                  {id: 'result', label: '結果', width: 180},
                  {id: 'missing', label: '缺少輸入', width: 150}
                ]}
                render={rule => [
                  rule.rule_id,
                  <span className="rp-code">{rule.expression ?? '—'}</span>,
                  <span className={'rp-light rp-trace-result ' + rule.result}>{rule.result}</span>,
                  rule.missing_inputs.join('、') || '—'
                ]}
              />
            </section>
          ))}
          {trace.result.dns.map(dns => (
            <section className="rp-card" key={dns.lookup_id}>
              <h3 className="rp-h3">DNS · {dns.name}</h3>
              <Kv
                items={[
                  ['類型', dns.qtype],
                  ['狀態', dns.status],
                  ['來源', dns.source],
                  ['快取', dns.cache],
                  ['位址', dns.addresses.join('、') || '—'],
                  ['錯誤', dns.error ?? '—']
                ]}
              />
            </section>
          ))}
        </section>
      )}
      {config && (
        <section className="rp-col">
          <h2 className="rp-h3">配置中的規則（讀自配置檔，非 API）</h2>
          <div className="rp-split">
            <div className="rp-list">
              <DataTable
                label="配置規則"
                rows={config.rules}
                selected={sel}
                onSelect={setSel}
                cols={[
                  {id: 'n', label: '#', width: 56, align: 'end'},
                  {id: 'c', label: '條件', isRowHeader: true},
                  {id: 'o', label: '目標', width: 88},
                  {id: 'm', label: 'must', width: 80},
                  {id: 's', label: '來源', width: 130},
                  {id: 'x', label: '註解', width: 80}
                ]}
                render={r => [r.n, <span className="rp-code">{r.cond}</span>, r.target, r.must ? 'must' : '', r.generated ? '生成' : r.source, r.note]}
              />
              <div className="rp-fb">
                <span className="rp-kw">fallback</span>: <span className="rp-out">{config.fallback.target}</span>
                <span className="rp-label">{config.fallback.source}，請在來源編輯器修改</span>
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
                      ['來源', cur.generated ? '生成，subscription policy' : cur.source],
                      ['狀態', cur.editable ? '可編輯' : '唯讀'],
                      ['世代 ID', config.generation_id]
                    ]}
                  />
                  <div className="rp-col">
                    <div className="rp-group-btns">
                      <Button
                        onPress={() => go('config', 'src=' + cur.source.split(':')[0] + '&line=' + cur.source.split(':')[1])}
                        isDisabled={!cur.editable}
                        secondary
                      >
                        開啟來源
                      </Button>
                      <ModalDialog
                        alert
                        trigger={
                          <Button negative isDisabled={!cur.editable}>
                            刪除
                          </Button>
                        }
                        title={'刪除規則 #' + cur.n}
                        narrow
                        footer={close => (
                          <>
                            <Button secondary onPress={close}>
                              取消
                            </Button>
                            <Button
                              negative
                              onPress={() => {
                                close();
                                toast('positive', '已刪除 #' + cur.n + '，reload 完成（r' + (runtime.diskRevision + 1) + '）');
                              }}
                            >
                              刪除並 reload
                            </Button>
                          </>
                        )}
                      >
                        <p className="rp-note">
                          從 {cur.source} 刪除 {cur.cond} -&gt; {cur.target}，以 If-Match r{runtime.diskRevision} 寫入，校驗通過後
                          reload。註解與其他行原樣保留。
                        </p>
                      </ModalDialog>
                    </div>
                    <RuleDialog trigger={<Button accent>新增規則</Button>} presets={[{label: '自訂', cond: 'domain(suffix: example.com)'}]} />
                  </div>
                </>
              ) : (
                <span className="rp-label">請選擇規則</span>
              )}
              <span className="rp-label">不提供命中計數與重設；複雜條件與 fallback 請在來源編輯器修改。</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
