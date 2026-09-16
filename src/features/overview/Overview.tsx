import {useMemo, useState} from 'react';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Data from '../../ui/icons/Data';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations, useRuntimeOutbounds, useTrafficHistory} from '../../api/store';
import {datapathFields, formatDuration, lifecycleStates, localTime, memoryFields, outboundUsage, trafficSeries} from '../../api/selectors';
import {formatBytes, formatRate, parseU64, pctU64} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {Button, DataTable, Disclosure, Kv, Light, Segmented, toast, errorText, ErrorMessage, Loading} from '../../ui/ui';
import {AreaChart, Donut, Legend, Spark, fmtRate, usePalette} from '../../ui/Charts';
import {memorySampleLimit, useMemorySamples} from './memory';
import type {PageProps} from '../types';
import type {Key} from '../../i18n/messages';

const operationLabels: Record<'reload' | 'suspend' | 'resume', Key> = {reload: 'ov.reload', suspend: 'ov.suspend', resume: 'ov.resume'};

// One page answers "is the service fine right now": status, rates, traffic, outbound usage; details fold below.
export function Overview(_: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const p = usePalette();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(!!resources?.runtime.available);
  const datapath = useDatapath(!!resources?.datapath.available);
  const memory = useRuntimeMemory(!!resources?.runtime_memory.available);
  const outbounds = useRuntimeOutbounds(resources?.runtime_outbounds.available === true);
  const operations = useRuntimeOperations(runtime.data, capabilities.data, runtime.refetch);
  const samples = useMemorySamples(memory.data);
  const [range, setRange] = useState('live');
  const history = useTrafficHistory(range, capabilities.data);
  const series = useMemo(() => trafficSeries(history.data), [history.data]);
  const chartRate = (value: number | null | undefined) => fmtRate(value, locale, t);
  const memoryBytes = (value: number | null | undefined) => formatBytes(value == null ? null : BigInt(Math.round(value)));
  const traffic = [
    {label: t('ui.download'), color: p.cat[0], values: series.down},
    {label: t('ui.upload'), color: p.cat[3], values: series.up}
  ];
  const memorySeries = [
    {label: t('ov.f.rss'), color: p.cat[0], values: samples.map(sample => sample.rss)},
    {label: t('ov.f.cgroupCurrent'), color: p.cat[3], values: samples.map(sample => sample.cgroup)}
  ];
  const usage = outboundUsage(outbounds.data);
  const donut = usage.rows.map((r, i) => ({
    name: r.name,
    value: r.percent === null ? null : Math.round(r.percent),
    text: formatBytes(r.bytes),
    color: r.name === 'block' ? p.love : p.cat[i % p.cat.length]
  }));
  const state = runtime.data?.lifecycle.state;
  const reload = runtime.data?.last_reload;
  const rss = memory.data?.process?.rss_bytes ?? null;
  const cgroupPercent = pctU64(parseU64(memory.data?.cgroup?.current_bytes ?? null), parseU64(memory.data?.cgroup?.limit_bytes ?? null));
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
  if (capabilities.error) return <ErrorMessage error={capabilities.error} />;
  if (runtime.error) return <ErrorMessage error={runtime.error} />;
  if (!runtime.data) return <Loading>{t('ov.loading')}</Loading>;
  const live = runtime.data;
  return (
    <div className="rp-page">
      <div className="rp-card">
        <div className="rp-row">
          <div className="rp-cluster">
            <Light tone={state === 'running' ? 'ok' : state === 'failed' ? 'err' : 'warn'}>{state ? t(lifecycleStates[state]) : t('ov.unknown')}</Light>
            <Kv
              inline
              items={[
                [t('ov.generation'), live.generation.active_id ?? '—'],
                [t('ov.revision'), live.generation.config_revision ?? '—'],
                [t('ov.uptime'), formatDuration(live.lifecycle.uptime_seconds, locale)],
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
      </div>
      {operations.error && <ErrorMessage error={operations.error} />}

      <div className="rp-strip">
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c1">
            <Download />
            {t('ui.download')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{formatRate(live.traffic.rates?.download_bytes_per_second ?? null)}</span>
            </span>
            <span className="rp-spark">
              <Spark values={series.down} timestamps={series.timestamps} color={p.cat[0]} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c4">
            <Upload />
            {t('ui.upload')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{formatRate(live.traffic.rates?.upload_bytes_per_second ?? null)}</span>
            </span>
            <span className="rp-spark">
              <Spark values={series.up} timestamps={series.timestamps} color={p.cat[3]} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c3">
            <LinkIcon />
            {t('ov.active')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{live.traffic.connections.total ?? '—'}</span>
            </span>
            <span className="rp-spark">
              <Spark values={series.connections} timestamps={series.timestamps} color={p.cat[2]} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c5">
            <Data />
            {t('ov.memory')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{formatBytes(rss)}</span>
            </span>
            {cgroupPercent !== null && (
              <Light small tone={cgroupPercent > 90 ? 'err' : cgroupPercent > 75 ? 'warn' : 'ok'}>
                {t('ov.cgroupShare', {percent: Math.round(cgroupPercent)})}
              </Light>
            )}
          </div>
        </div>
      </div>

      <div className="rp-g21">
        <section className="rp-card" aria-labelledby="overview-traffic">
          <div className="rp-row">
            <h3 className="rp-h3" id="overview-traffic">
              {t('ov.traffic')}
            </h3>
            <Segmented
              label={t('ov.historyRange')}
              value={range}
              onChange={setRange}
              items={[
                ['live', t('ov.live')],
                ['h1', t('ov.h1')],
                ['h6', t('ov.h6')],
                ['h24', t('ov.h24')],
                ['d7', t('ov.d7')]
              ]}
            />
          </div>
          {history.error ? (
            <ErrorMessage error={history.error} />
          ) : resources?.traffic_history.available === false ? (
            <span className="rp-empty">{t('ov.noHistory')}</span>
          ) : !history.data ? (
            <Loading />
          ) : !history.data.samples.length ? (
            <span className="rp-empty">{t('ov.emptyHistory')}</span>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart series={traffic} timestamps={series.timestamps} fmt={chartRate} locale={locale} height={150} />
            </>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-outbounds">
          <div className="rp-row">
            <h3 className="rp-h3" id="overview-outbounds">
              {t('ov.outUsage')}
            </h3>
            {outbounds.data && <span className="rp-label">{t('ov.since', {t: localTime(outbounds.data.counter_since, locale)})}</span>}
          </div>
          {outbounds.error ? (
            <ErrorMessage error={outbounds.error} />
          ) : resources?.runtime_outbounds.available === false ? (
            <span className="rp-empty">{t('ov.noOutbounds')}</span>
          ) : !outbounds.data ? (
            <Loading />
          ) : !donut.length ? (
            <span className="rp-empty">{t('ui.empty')}</span>
          ) : (
            <Donut rows={donut} total={formatBytes(usage.total)} />
          )}
        </section>
      </div>

      <Disclosure id="overview-details" title={t('ov.details')}>
        <div className="rp-g21">
          <section className="rp-card">
            <h3 className="rp-h3">{t('ov.datapath')}</h3>
            {datapath.error && <ErrorMessage error={datapath.error} />}
            {datapath.data ? (
              <>
                <Kv items={datapathFields(datapath.data, t('ov.unknown'), t)} />
                {datapath.data.ebpf && (
                  <DataTable
                    label={t('ov.attachments')}
                    height={220}
                    rows={attachments}
                    empty={t('ov.unknown')}
                    cols={[
                      {id: 'n', label: t('ov.name'), minWidth: 128, isRowHeader: true},
                      {id: 'i', label: t('ov.interface'), minWidth: 88},
                      {id: 'd', label: t('ov.direction'), minWidth: 80, grow: 0},
                      {id: 's', label: t('ov.state'), minWidth: 88, grow: 0}
                    ]}
                    render={a => [a.name, a.interface, a.direction, a.state]}
                  />
                )}
                {datapath.data.errors.length > 0 && (
                  <div className="rp-list">
                    {datapath.data.errors.map((error, i) => (
                      <Light key={i} small tone="err">
                        {error.code} · {error.message}
                      </Light>
                    ))}
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
              <>
                <Kv items={memoryFields(memory.data, t)} />
                {samples.length > 1 && (
                  <>
                    <Legend series={memorySeries} fmt={memoryBytes} />
                    <AreaChart series={memorySeries} timestamps={samples.map(sample => sample.time)} fmt={memoryBytes} locale={locale} height={120} />
                    <span className="rp-label">{t('ov.memoryHistoryHelp', {n: memorySampleLimit})}</span>
                  </>
                )}
              </>
            ) : capabilities.loading || memory.loading ? (
              <Loading />
            ) : (
              <span className="rp-empty">{t('ov.unavailable')}</span>
            )}
          </section>
        </div>
      </Disclosure>
    </div>
  );
}
