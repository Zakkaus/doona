import {useMemo, useState} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations, useTrafficHistory} from '../../api/store';
import {datapathFields, datapathValue, formatDuration, lifecycleStates, localTime, memoryFields, trafficSeries} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {Button, DataTable, Kv, Light, Segmented, TextTooltip, toast, errorText, ErrorMessage, Loading} from '../../ui/ui';
import {AreaChart, Legend, fmtRate, usePalette} from '../../ui/Charts';
import {useMemorySamples} from './memory';
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
  const palette = usePalette();
  const samples = useMemorySamples(memory.data);
  const memorySeries = [
    {label: t('ov.f.rss'), color: palette.cat[0], values: samples.map(sample => sample.rss)},
    {label: t('ov.f.cgroupCurrent'), color: palette.cat[3], values: samples.map(sample => sample.cgroup)}
  ];
  const memoryBytes = (value: number | null | undefined) => formatBytes(value == null ? null : BigInt(Math.round(value)));
  const [range, setRange] = useState('live');
  const history = useTrafficHistory(range, capabilities.data);
  const series = useMemo(() => trafficSeries(history.data), [history.data]);
  const traffic = [
    {label: t('ui.download'), color: palette.cat[0], values: series.down},
    {label: t('ui.upload'), color: palette.cat[3], values: series.up}
  ];
  const chartRate = (value: number | null | undefined) => fmtRate(value, locale, t);
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
      <div className="rp-grid-pair">
        <section className="rp-card" aria-labelledby="overview-memory-chart">
          <h3 className="rp-h3" id="overview-memory-chart">
            {t('ov.memory')}
          </h3>
          {memory.error && <ErrorMessage error={memory.error} />}
          {samples.length ? (
            <>
              <Legend series={memorySeries} fmt={memoryBytes} />
              <AreaChart series={memorySeries} timestamps={samples.map(sample => sample.time)} fmt={memoryBytes} locale={locale} height={150} />
              {memory.data && <Kv items={memoryFields(memory.data, t)} />}
            </>
          ) : capabilities.loading || memory.loading ? (
            <Loading />
          ) : (
            <span className="rp-empty">{t('ov.unavailable')}</span>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-traffic-chart">
          <div className="rp-row">
            <h3 className="rp-h3" id="overview-traffic-chart">
              {t('ov.traffic')}
            </h3>
            <Segmented
              label={t('act.historyRange')}
              value={range}
              onChange={setRange}
              items={[
                ['live', t('act.live')],
                ['h1', t('act.h1')],
                ['h6', t('act.h6')],
                ['h24', t('act.h24')],
                ['d7', t('act.d7')]
              ]}
            />
          </div>
          {history.error ? (
            <ErrorMessage error={history.error} />
          ) : capabilities.error || resources?.traffic_history.available === false ? (
            <span className="rp-label">{t('ov.unavailable')}</span>
          ) : !history.data ? (
            <Loading>{t('ov.loading')}</Loading>
          ) : !history.data.samples.length ? (
            <span className="rp-empty">{t('act.emptyHistory')}</span>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart series={traffic} timestamps={series.timestamps} fmt={chartRate} locale={locale} height={150} />
            </>
          )}
        </section>
      </div>
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
                  {id: 'n', label: t('ov.name'), minWidth: 152, isRowHeader: true},
                  {id: 'i', label: t('ov.interface'), minWidth: 116},
                  {id: 'd', label: t('ov.direction'), minWidth: 104, grow: 0},
                  {id: 's', label: t('ov.state'), minWidth: 120, grow: 0}
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
    </div>
  );
}
