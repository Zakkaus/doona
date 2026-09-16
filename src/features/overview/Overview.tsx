import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations} from '../../api/store';
import {datapathFields, datapathValue, formatDuration, lifecycleStates, localTime, memoryFields} from '../../api/selectors';
import {useT, useLang, LOCALE} from '../../i18n';
import {Button, DataTable, Kv, Light, TextTooltip, toast, errorText, ErrorMessage, Loading} from '../../ui/ui';
import type {Key} from '../../i18n/messages';

const operationLabels: Record<'reload' | 'suspend' | 'resume', Key> = {reload: 'ov.reload', suspend: 'ov.suspend', resume: 'ov.resume'};

export function Overview() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
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
      if (result)
        toast(
          result.status === 'succeeded' ? 'positive' : 'negative',
          t('ov.operationResult', {
            action: t(operationLabels[kind]),
            status: t(result.status === 'succeeded' ? 'ov.succeeded' : 'ov.failed'),
            id: result.operation_id
          })
        );
    } catch (error) {
      toast('negative', t('ov.operationError', {error: errorText(error)}));
    }
  }
  return (
    <div className="rp-page">
      {capabilities.error && <ErrorMessage error={capabilities.error} />}
      <div className="rp-between">
        <div className="rp-cluster">
          <Light tone={state === 'running' ? 'ok' : state === 'failed' ? 'err' : 'warn'}>
            {state ? t(lifecycleStates[state]) : capabilities.loading || runtime.loading ? t('ov.loading') : t('ov.unknown')}
          </Light>
          <Kv
            inline
            items={[
              [t('ov.config'), runtime.data?.generation.config_revision ?? runtime.data?.generation.active_id ?? '—'],
              [t('ov.uptime'), formatDuration(runtime.data?.lifecycle.uptime_seconds ?? null, locale)],
              [t('ov.lastReload'), reload ? localTime(reload.finished_at, locale) : '—']
            ]}
          />
          {reload && (
            <TextTooltip text={reload.operation_id}>
              <Light small tone={reload.status === 'succeeded' ? 'ok' : reload.status === 'failed' ? 'err' : 'warn'}>
                {t(reload.status === 'succeeded' ? 'ov.succeeded' : reload.status === 'failed' ? 'ov.failed' : 'ov.running')}
              </Light>
            </TextTooltip>
          )}
        </div>
        <div className="rp-cluster">
          {(['reload', 'suspend', 'resume'] as const)
            .filter(kind => operations.canRun(kind) || operations.busy === kind)
            .map(kind => (
              <Button key={kind} secondary small isPending={operations.busy === kind} isDisabled={!!operations.busy} onPress={() => void run(kind)}>
                {t(operationLabels[kind])}
              </Button>
            ))}
        </div>
      </div>
      {runtime.error && <ErrorMessage error={runtime.error} />}
      {operations.error && <ErrorMessage error={operations.error} />}
      <div className="rp-g21">
        <section className="rp-card" aria-labelledby="overview-datapath">
          <h3 className="rp-h3" id="overview-datapath">
            {t('ov.datapath')}
          </h3>
          {datapath.error && <ErrorMessage error={datapath.error} />}
          {datapath.data ? (
            <>
              <Kv items={datapathFields(datapath.data, t('ov.unknown'), t)} />
              {datapath.data.ebpf && (
                <DataTable
                  label={t('ov.attachments')}
                  height={attachments.length ? Math.min(250, 40 + attachments.length * 40) : 120}
                  rows={attachments}
                  empty={t('ov.unknown')}
                  cols={[
                    {id: 'n', label: t('ov.name'), minWidth: 128, isRowHeader: true},
                    {id: 'i', label: t('ov.interface'), minWidth: 88, drop: 2},
                    {id: 'd', label: t('ov.direction'), minWidth: 80, grow: 0, drop: 1},
                    {id: 's', label: t('ov.state'), minWidth: 88, grow: 0}
                  ]}
                  render={a => [a.name, a.interface, datapathValue(a.direction, t), datapathValue(a.state, t)]}
                />
              )}
              {(datapath.data.errors.length > 0 || datapath.data.ebpf?.last_error) && (
                <div className="rp-cluster">
                  {datapath.data.errors.map((error, i) => (
                    <TextTooltip key={i} text={error.code}>
                      <Light small tone="err">
                        {error.message}
                      </Light>
                    </TextTooltip>
                  ))}
                  {datapath.data.ebpf?.last_error && !datapath.data.errors.some(error => error.message === datapath.data?.ebpf?.last_error) && (
                    <Light small tone="warn">
                      {datapath.data.ebpf.last_error}
                    </Light>
                  )}
                </div>
              )}
            </>
          ) : capabilities.loading || datapath.loading ? (
            <Loading />
          ) : (
            <span className="rp-empty">{t('ov.unavailable')}</span>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-memory">
          <h3 className="rp-h3" id="overview-memory">
            {t('ov.memory')}
          </h3>
          {memory.error && <ErrorMessage error={memory.error} />}
          {memory.data ? (
            <Kv items={memoryFields(memory.data, t)} />
          ) : capabilities.loading || memory.loading ? (
            <Loading />
          ) : (
            <span className="rp-empty">{t('ov.unavailable')}</span>
          )}
        </section>
      </div>
    </div>
  );
}
