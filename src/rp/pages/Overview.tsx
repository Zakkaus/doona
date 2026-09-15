import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations} from '../../api/store';
import {datapathFields, formatDuration, localTime, memoryFields} from '../../api/selectors';
import {useT} from '../../app/i18n';
import {Button, DataTable, Kv, Light, toast} from '../ui';
import type {PageProps} from './types';

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
  const attachments = (datapath.data?.ebpf?.attachments ?? []).map((a, i) => ({...a, id: String(i)}));
  async function run(kind: 'reload' | 'suspend' | 'resume') {
    try {
      const result = await operations.run(kind);
      if (result) toast(result.status === 'succeeded' ? 'positive' : 'negative', t(`ov.${kind}`) + ' ' + t(result.status === 'succeeded' ? 'ov.succeeded' : 'ov.failed') + ' · ' + result.operation_id);
    } catch (error) { toast('negative', t('ov.failed') + ' · ' + String(error)); }
  }
  return (
    <div className="rp-page">
      {capabilities.error && <p role="alert">{capabilities.error.message}</p>}
      <div className="rp-between">
        <Light tone={state === 'running' ? 'ok' : state === 'failed' ? 'err' : 'warn'}>{state ? t(`lifecycle.${state}`) : capabilities.loading || runtime.loading ? t('ov.loading') : t('ov.unknown')}</Light>
        <Kv inline items={[[t('ov.generation'), runtime.data?.generation.active_id ?? '—'], [t('ov.revision'), runtime.data?.generation.config_revision ?? '—'], [t('ov.uptime'), formatDuration(runtime.data?.lifecycle.uptime_seconds ?? null, {d: t('unit.d'), h: t('unit.h'), m: t('unit.m'), s: t('unit.s')})], [t('ov.lastReload'), reload ? reload.operation_id + ' · ' + t(reload.status === 'succeeded' ? 'ov.succeeded' : reload.status === 'failed' ? 'ov.failed' : 'ov.running') + ' · ' + localTime(reload.finished_at) : '—']]} />
      </div>
      {runtime.error && <p role="alert">{runtime.error.message}</p>}
      <div className="rp-split">
        <section className="rp-card">
          <h3 className="rp-h3">{t('ov.datapath')}</h3>
          {datapath.error && <p role="alert">{datapath.error.message}</p>}
          {datapath.data ? <>
            <Kv items={datapathFields(datapath.data, t('ov.unknown'), key => t(`ov.f.${key}` as 'ov.f.kind'))} />
            {datapath.data.ebpf && <DataTable label={t('ov.attachments')} height={250} rows={attachments} empty={t('ov.unknown')}
              cols={[{id: 'n', label: t('ov.name'), isRowHeader: true}, {id: 'i', label: t('ov.interface')}, {id: 'd', label: t('ov.direction')}, {id: 's', label: t('ov.state')}]}
              render={a => [a.name, a.interface, a.direction, a.state]} />}
            <h3 className="rp-h3">{t('ov.errors')}</h3>
            {datapath.data.errors.length ? <ul>{datapath.data.errors.map((error, i) => <li key={i}>{error.code} · {error.message}</li>)}</ul> : <span>—</span>}
          </> : <span className="rp-label">{capabilities.loading || datapath.loading ? t('ov.loading') : resources?.datapath.available ? '—' : t('ov.unavailable')}</span>}
        </section>
        <div className="rp-col">
          <section className="rp-card">
            <h3 className="rp-h3">{t('ov.memory')}</h3>
            {memory.error && <p role="alert">{memory.error.message}</p>}
            {memory.data ? <Kv items={memoryFields(memory.data, key => t(`ov.f.${key}` as 'ov.f.kind'))} /> : <span className="rp-label">{capabilities.loading || memory.loading ? t('ov.loading') : resources?.runtime_memory.available ? '—' : t('ov.unavailable')}</span>}
          </section>
          <section className="rp-card">
            <h3 className="rp-h3">{t('ov.operations')}</h3>
            <div className="rp-cluster">{(['reload', 'suspend', 'resume'] as const).map(kind => <Button key={kind} primary isDisabled={!!operations.busy || !operations.canRun(kind)} onPress={() => void run(kind)}>{t(`ov.${kind}`)}{operations.busy === kind ? ' · ' + t('ov.running') : ''}</Button>)}</div>
            {operations.operation && <span className="rp-code">{operations.operation.operation_id}</span>}
            {operations.error && <p role="alert">{operations.error.message}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
