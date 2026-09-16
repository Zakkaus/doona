import {useMemo, useState} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations, useTrafficHistory} from '../../api/store';
import {datapathFields, formatDuration, lifecycleStates, localTime, memoryFields, trafficSeries} from '../../api/selectors';
import {formatBytes} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {Button, DataTable, Kv, Light, Segmented, toast, errorText, ErrorMessage, Loading} from '../../ui/ui';
import {AreaChart, Legend, fmtRate, usePalette} from '../../ui/Charts';
import {memorySampleLimit, useMemorySamples} from './memory';
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
        <Light tone={state === 'running' ? 'ok' : state === 'failed' ? 'err' : 'warn'}>
          {state ? t(lifecycleStates[state]) : capabilities.loading || runtime.loading ? t('ov.loading') : t('ov.unknown')}
        </Light>
        <Kv
          inline
          items={[
            [t('ov.generation'), runtime.data?.generation.active_id ?? '—'],
            [t('ov.revision'), runtime.data?.generation.config_revision ?? '—'],
            [t('ov.uptime'), formatDuration(runtime.data?.lifecycle.uptime_seconds ?? null, locale)],
            [
              t('ov.lastReload'),
              reload
                ? t('ov.reloadResult', {
                    id: reload.operation_id,
                    status: t(reload.status === 'succeeded' ? 'ov.succeeded' : reload.status === 'failed' ? 'ov.failed' : 'ov.running'),
                    time: localTime(reload.finished_at, locale)
                  })
                : '—'
            ]
          ]}
        />
      </div>
      {runtime.error && <ErrorMessage error={runtime.error} />}
      <div className="rp-grid-pair">
        <section className="rp-card" aria-labelledby="overview-memory-chart">
          <h3 className="rp-h3" id="overview-memory-chart">
            {t('ov.memoryHistory')}
          </h3>
          <p className="rp-note">{t('ov.memoryHistoryHelp', {n: memorySampleLimit})}</p>
          {memory.error && <ErrorMessage error={memory.error} />}
          {samples.length ? (
            <>
              <Legend series={memorySeries} fmt={memoryBytes} />
              <AreaChart series={memorySeries} timestamps={samples.map(sample => sample.time)} fmt={memoryBytes} locale={locale} height={150} />
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
      <div className="rp-split">
        <section className="rp-card">
          <h3 className="rp-h3">{t('ov.datapath')}</h3>
          {datapath.error && <ErrorMessage error={datapath.error} />}
          {datapath.data ? (
            <>
              <Kv items={datapathFields(datapath.data, t('ov.unknown'), t)} />
              {datapath.data.ebpf && (
                <DataTable
                  label={t('ov.attachments')}
                  height={250}
                  rows={attachments}
                  empty={t('ov.unknown')}
                  cols={[
                    {id: 'n', label: t('ov.name'), minWidth: 152, isRowHeader: true},
                    {id: 'i', label: t('ov.interface'), minWidth: 116},
                    {id: 'd', label: t('ov.direction'), minWidth: 104, grow: 0},
                    {id: 's', label: t('ov.state'), minWidth: 120, grow: 0}
                  ]}
                  render={a => [a.name, a.interface, a.direction, a.state]}
                />
              )}
              <h3 className="rp-h3">{t('ov.errors')}</h3>
              {datapath.data.errors.length ? (
                <ul>
                  {datapath.data.errors.map((error, i) => (
                    <li key={i}>
                      {error.code} · {error.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>—</span>
              )}
            </>
          ) : capabilities.loading || datapath.loading ? (
            <Loading />
          ) : (
            <span className="rp-empty">{t('ov.unavailable')}</span>
          )}
        </section>
        <div className="rp-col">
          <section className="rp-card">
            <h3 className="rp-h3">{t('ov.memory')}</h3>
            {memory.error && <ErrorMessage error={memory.error} />}
            {memory.data ? (
              <Kv items={memoryFields(memory.data, t)} />
            ) : capabilities.loading || memory.loading ? (
              <Loading />
            ) : (
              <span className="rp-empty">{t('ov.unavailable')}</span>
            )}
          </section>
          <section className="rp-card">
            <h3 className="rp-h3">{t('ov.operations')}</h3>
            <div className="rp-cluster">
              {(['reload', 'suspend', 'resume'] as const).map(kind => (
                <Button
                  key={kind}
                  primary
                  isPending={operations.busy === kind}
                  isDisabled={!!operations.busy || !operations.canRun(kind)}
                  onPress={() => void run(kind)}
                >
                  {operations.busy === kind ? t('ov.operationBusy', {action: t(operationLabels[kind])}) : t(operationLabels[kind])}
                </Button>
              ))}
            </div>
            {operations.operation && <span className="rp-code">{operations.operation.operation_id}</span>}
            {operations.error && <ErrorMessage error={operations.error} />}
          </section>
        </div>
      </div>
    </div>
  );
}
