import {Button} from '@react-spectrum/s2/Button';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Text} from '@react-spectrum/s2/Text';
import {TableView, TableHeader, Column, TableBody, Row, Cell} from '@react-spectrum/s2/TableView';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations} from '../../api/store';
import {datapathFields, formatDuration, localTime, memoryFields} from '../../api/selectors';
import {page, between, card, label, row, split, col, h3, Kv, toast} from '../ui';
import {useT} from '../i18n';
import type {PageProps} from '../Shell';

export function Overview(_: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(!!resources?.runtime.available);
  const datapath = useDatapath(!!resources?.datapath.available);
  const memory = useRuntimeMemory(!!resources?.runtime_memory.available);
  const operations = useRuntimeOperations(runtime.data, capabilities.data, runtime.refetch);
  const state = runtime.data?.lifecycle.state;
  const reload = runtime.data?.last_reload;
  async function run(kind: 'reload' | 'suspend' | 'resume') {
    try {
      const result = await operations.run(kind);
      if (result) toast(result.status === 'succeeded' ? 'positive' : 'negative', t(`ov.${kind}`) + ' ' + t(result.status === 'succeeded' ? 'ov.succeeded' : 'ov.failed') + ' · ' + result.operation_id);
    } catch (error) { toast('negative', t('ov.failed') + ' · ' + String(error)); }
  }
  return (
    <div className={page}>
      {capabilities.error && <p role="alert">{capabilities.error.message}</p>}
      <div className={between}>
        <StatusLight variant={state === 'running' ? 'positive' : state === 'failed' ? 'negative' : 'notice'}><Text>{state ? t(`lifecycle.${state}`) : capabilities.loading || runtime.loading ? t('ov.loading') : t('ov.unknown')}</Text></StatusLight>
        <Kv items={[[t('ov.generation'), runtime.data?.generation.active_id ?? '—'], [t('ov.revision'), runtime.data?.generation.config_revision ?? '—'], [t('ov.uptime'), formatDuration(runtime.data?.lifecycle.uptime_seconds ?? null, {d: t('unit.d'), h: t('unit.h'), m: t('unit.m'), s: t('unit.s')})], [t('ov.lastReload'), reload ? reload.operation_id + ' · ' + t(reload.status === 'succeeded' ? 'ov.succeeded' : reload.status === 'failed' ? 'ov.failed' : 'ov.running') + ' · ' + localTime(reload.finished_at) : '—']]} />
      </div>
      {runtime.error && <p role="alert">{runtime.error.message}</p>}
      <div className={split}>
        <section className={card}>
          <h3 className={h3}>{t('ov.datapath')}</h3>
          {datapath.error && <p role="alert">{datapath.error.message}</p>}
          {datapath.data ? <>
            <Kv items={datapathFields(datapath.data, t('ov.unknown'), key => t(`ov.f.${key}` as 'ov.f.kind'))} />
            {datapath.data.ebpf && <TableView aria-label={t('ov.attachments')} styles={style({height: 250})}>
              <TableHeader><Column id="n" isRowHeader>{t('ov.name')}</Column><Column id="i">{t('ov.interface')}</Column><Column id="d">{t('ov.direction')}</Column><Column id="s">{t('ov.state')}</Column></TableHeader>
              <TableBody renderEmptyState={() => t('ov.unknown')}>{(datapath.data.ebpf.attachments ?? []).map((a, i) => <Row key={i} id={i}><Cell>{a.name}</Cell><Cell>{a.interface}</Cell><Cell>{a.direction}</Cell><Cell>{a.state}</Cell></Row>)}</TableBody>
            </TableView>}
            <h3 className={h3}>{t('ov.errors')}</h3>
            {datapath.data.errors.length ? <ul>{datapath.data.errors.map((error, i) => <li key={i}>{error.code} · {error.message}</li>)}</ul> : <span>—</span>}
          </> : <span className={label}>{capabilities.loading || datapath.loading ? t('ov.loading') : resources?.datapath.available ? '—' : t('ov.unavailable')}</span>}
        </section>
        <div className={col}>
          <section className={card}>
            <h3 className={h3}>{t('ov.memory')}</h3>
            {memory.error && <p role="alert">{memory.error.message}</p>}
            {memory.data ? <Kv items={memoryFields(memory.data, key => t(`ov.f.${key}` as 'ov.f.kind'))} /> : <span className={label}>{capabilities.loading || memory.loading ? t('ov.loading') : resources?.runtime_memory.available ? '—' : t('ov.unavailable')}</span>}
          </section>
          <section className={card}>
            <h3 className={h3}>{t('ov.operations')}</h3>
            <div className={row}>{(['reload', 'suspend', 'resume'] as const).map(kind => <Button key={kind} variant="primary" isDisabled={!!operations.busy || !operations.canRun(kind)} onPress={() => void run(kind)}>{t(`ov.${kind}`)}{operations.busy === kind ? ' · ' + t('ov.running') : ''}</Button>)}</div>
            {operations.operation && <span>{operations.operation.operation_id}</span>}
            {operations.error && <p role="alert">{operations.error.message}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
