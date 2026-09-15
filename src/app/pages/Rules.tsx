import {useState} from 'react';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {Button} from '@react-spectrum/s2/Button';
import {ButtonGroup} from '@react-spectrum/s2/ButtonGroup';
import {DialogTrigger, AlertDialog} from '@react-spectrum/s2/AlertDialog';
import {TextField} from '@react-spectrum/s2/TextField';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Text} from '@react-spectrum/s2/Text';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key, Selection} from '@react-spectrum/s2';
import {useConfigRules, useRoutingTrace} from '../../api/store';
import {page, split, card, code, label, note, kw, out, h3, col, Kv, toast} from '../ui';
import {runtime} from '../mock';
import {RuleDialog} from '../RuleDialog';
import type {PageProps} from '../Shell';

const fb = style({display: 'flex', alignItems: 'center', gap: 16, font: 'code', paddingX: 16, minHeight: 40, backgroundColor: 'gray-75', borderRadius: 'default'});
const formGrid = style({display: 'grid', gridTemplateColumns: {default: ['minmax(0, 1fr)'], md: ['repeat(2, minmax(0, 1fr))'], xl: ['repeat(4, minmax(0, 1fr))']}, gap: 16});
export function Rules({go}: PageProps) {
  const trace = useRoutingTrace();
  const {form, setForm} = trace;
  const config = useConfigRules();
  const [sel, setSel] = useState<Selection>(new Set<Key>(['r4']));
  const cur = config?.rules.find(r => sel !== 'all' && sel.has(r.id));
  return (
    <div className={page}>
      <p className={note}>模擬目前配置的路由結果，不代表實際連線。域名與目的 IP 至少填寫一項；即時解析時，目的 IP 必須留空。</p>
      <form className={card} onSubmit={e => { e.preventDefault(); void trace.submit(); }}>
        <div className={formGrid}>
          <Picker label="網路協定" selectedKey={form.network} onSelectionChange={k => k != null && setForm({...form, network: k as 'tcp' | 'udp'})}><PickerItem id="tcp">TCP</PickerItem><PickerItem id="udp">UDP</PickerItem></Picker>
          <TextField label="域名" value={form.domain} onChange={domain => setForm({...form, domain})} />
          <TextField label="目的 IP" value={form.dst_ip} onChange={dst_ip => setForm({...form, dst_ip})} />
          <TextField label="目的連接埠" value={form.dst_port} onChange={dst_port => setForm({...form, dst_port})} />
          <TextField label="來源 IP" value={form.src_ip} onChange={src_ip => setForm({...form, src_ip})} />
          <TextField label="來源連接埠" value={form.src_port} onChange={src_port => setForm({...form, src_port})} />
          <TextField label="程序名稱" value={form.pname} onChange={pname => setForm({...form, pname})} />
          <Picker label="解析模式" selectedKey={form.resolve} onSelectionChange={k => k != null && setForm({...form, resolve: k as 'none' | 'live'})}>{trace.modes.map(id => <PickerItem key={id} id={id}>{id === 'none' ? '不解析（none）' : '即時解析（live）'}</PickerItem>)}</Picker>
        </div>
        {trace.invalid && <p className={note}>{trace.invalid}</p>}
        {!trace.available && <p className={note}>不支援路由追蹤</p>}
        <Button variant="accent" isDisabled={trace.busy || !!trace.invalid || !trace.available || !trace.modes.includes(form.resolve)} onPress={() => void trace.submit()}>{trace.busy ? '追蹤中' : '追蹤'}</Button>
      </form>
      {trace.error && <p role="alert">{trace.error.message}</p>}
      {trace.result && <section className={col} aria-label="模擬結果">
        <Kv items={[["模式", trace.result.mode], ['執行個體', trace.result.instance_id], ['世代 ID', trace.result.generation_id], ['觀測時間', trace.result.observed_at]]} />
        {trace.result.evaluations.map((evaluation, i) => <section className={card} key={i}>
          <h3 className={h3}>{evaluation.dst_ip ?? '域名'}</h3>
          <Kv items={[["判定", evaluation.decision], ['出站', evaluation.outbound ?? '—'], ['缺少輸入', evaluation.missing_inputs.join('、') || '無']]} />
          <TableView aria-label={'規則評估 ' + (i + 1)} styles={style({height: 400})}>
            <TableHeader><Column id="id" isRowHeader width={90}>規則 ID</Column><Column id="expression">運算式</Column><Column id="result" width={180}>結果</Column><Column id="missing" width={150}>缺少輸入</Column></TableHeader>
            <TableBody items={evaluation.rules}>{rule => <Row id={rule.rule_id}>
              <Cell>{rule.rule_id}</Cell><Cell><span className={code}>{rule.expression ?? '—'}</span></Cell>
              <Cell><span style={{opacity: rule.result === 'skipped' ? 0.5 : 1}}><StatusLight size="S" variant={rule.result === 'matched' ? 'positive' : rule.result === 'indeterminate' ? 'notice' : 'neutral'}><Text>{rule.result}</Text></StatusLight></span></Cell>
              <Cell>{rule.missing_inputs.join('、') || '—'}</Cell>
            </Row>}</TableBody>
          </TableView>
        </section>)}
        {trace.result.dns.map(dns => <section className={card} key={dns.lookup_id}>
          <h3 className={h3}>DNS · {dns.name}</h3>
          <Kv items={[["類型", dns.qtype], ['狀態', dns.status], ['來源', dns.source], ['快取', dns.cache], ['位址', dns.addresses.join('、') || '—'], ['錯誤', dns.error ?? '—']]} />
        </section>)}
      </section>}
      {config && <section className={col}>
        <h2 className={h3}>配置中的規則（讀自配置檔，非 API）</h2>
        <div className={split}>
          <div className={col}>
            <TableView aria-label="配置規則" selectionMode="single" selectedKeys={sel} onSelectionChange={setSel} styles={style({height: 442})}>
              <TableHeader><Column id="n" width={48}>#</Column><Column id="c" isRowHeader>條件</Column><Column id="o" width={88}>目標</Column><Column id="m" width={80}>must</Column><Column id="s" width={130}>來源</Column><Column id="x" width={80}>註解</Column></TableHeader>
              <TableBody items={config.rules}>{r => <Row id={r.id}><Cell>{r.n}</Cell><Cell textValue={r.cond}><span className={code}>{r.cond}</span></Cell><Cell>{r.target}</Cell><Cell>{r.must ? 'must' : ''}</Cell><Cell>{r.generated ? '生成' : r.source}</Cell><Cell>{r.note}</Cell></Row>}</TableBody>
            </TableView>
            <div className={fb}><span className={kw}>fallback</span>: <span className={out}>{config.fallback.target}</span><span className={label}>{config.fallback.source}，請在來源編輯器修改</span></div>
          </div>
          <div className={card}>
            {cur ? <>
              <h3 className={h3}>#{cur.n} {cur.target}{cur.must ? '(must)' : ''}</h3>
              <span className={code}>{cur.cond}</span>
              <Kv items={[["來源", cur.generated ? '生成，subscription policy' : cur.source], ['狀態', cur.editable ? '可編輯' : '唯讀'], ['世代 ID', config.generation_id]]} />
              <div className={col}>
                <ButtonGroup>
                  <Button variant="secondary" onPress={() => go('config', 'src=' + cur.source.split(':')[0] + '&line=' + cur.source.split(':')[1])} isDisabled={!cur.editable}>開啟來源</Button>
                  <DialogTrigger>
                    <Button variant="negative" fillStyle="outline" isDisabled={!cur.editable}>刪除</Button>
                    <AlertDialog variant="destructive" title={'刪除規則 #' + cur.n} primaryActionLabel="刪除並 reload" cancelLabel="取消" onPrimaryAction={() => toast('positive', '已刪除 #' + cur.n + '，reload 完成（r' + (runtime.diskRevision + 1) + '）')}>
                      從 {cur.source} 刪除 {cur.cond} -&gt; {cur.target}，以 If-Match r{runtime.diskRevision} 寫入，校驗通過後 reload。註解與其他行原樣保留。
                    </AlertDialog>
                  </DialogTrigger>
                </ButtonGroup>
                <RuleDialog trigger={<Button variant="accent">新增規則</Button>} presets={[{label: '自訂', cond: 'domain(suffix: example.com)'}]} />
              </div>
            </> : <span className={label}>請選擇規則</span>}
            <span className={label}>不提供命中計數與重設；複雜條件與 fallback 請在來源編輯器修改。</span>
          </div>
        </div>
      </section>}
    </div>
  );
}
