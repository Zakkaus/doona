import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useVersion} from '../../api/store';
import {datapathFields, datapathValue, formatDuration, lifecycleStates, lifecycleTone, localTime, memoryFields, shortId} from '../../api/selectors';
import {useT, useLang, LOCALE} from '../../i18n';
import {Badge, Bar, Button, DataTable, Kv, Light, TextTooltip, downloadFile, ErrorMessage, Loading, exportName, Empty} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {usePalette} from '../../ui/Charts';
import {LifecycleActions} from './Lifecycle';
import {formatBytes, parseU64, pctU64} from '../../api/u64';
import {formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {Capabilities} from '../../api/model';

// The optional resources a backend may leave out; the always-present ones are not worth a row.
const resourceLabels = {
  connections: 'nav.connections',
  flows: 'rule.flows',
  routing_trace: 'ov.r.routingTrace',
  dns_query: 'ov.r.dnsQuery',
  dns_cache: 'ov.r.dnsCache',
  events: 'nav.events',
  probes: 'ov.r.probes',
  traffic_history: 'ov.r.trafficHistory',
  memory_history: 'ov.r.memoryHistory',
  runtime_outbounds: 'ov.r.outbounds',
  logs: 'nav.logs',
  providers: 'nodes.providers',
  config: 'nav.config',
  runtime_settings: 'settings.runtime',
  geodata: 'settings.geodata'
} as const satisfies Record<string, Key>;
function resourceRows(capabilities: Capabilities): Array<[keyof typeof resourceLabels, boolean]> {
  return (Object.keys(resourceLabels) as Array<keyof typeof resourceLabels>).map(key => [key, capabilities.resources[key].available !== false]);
}

export function Overview() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(!!resources?.runtime.available);
  const datapath = useDatapath(!!resources?.datapath.available);
  const memory = useRuntimeMemory(!!resources?.runtime_memory.available);
  const version = useVersion();
  const palette = usePalette();
  const state = runtime.data?.lifecycle.state;
  const count = (value: number | null) => (value === null ? '—' : formatNumber(value, locale));
  const cgroupPercent = pctU64(parseU64(memory.data?.cgroup?.current_bytes ?? null), parseU64(memory.data?.cgroup?.limit_bytes ?? null));
  const revision = runtime.data?.generation.config_revision ?? runtime.data?.generation.active_id ?? '—';
  const reload = runtime.data?.last_reload;
  const attachments = (datapath.data?.ebpf?.attachments ?? []).map((a, i) => ({...a, id: String(i)}));
  return (
    <div className="rp-page">
      {capabilities.error && <ErrorMessage error={capabilities.error} />}
      <div className="rp-between">
        <div className="rp-cluster">
          <Light tone={lifecycleTone(state)}>
            {state ? t(lifecycleStates[state]) : capabilities.loading || runtime.loading ? t('ov.loading') : t('ov.unknown')}
          </Light>
          <Kv
            row
            items={[
              // A revision is a UUID; the strip shows its first block, the whole value sits in the tooltip.
              [t('ov.config'), shortId(revision), revision],
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
          <Button
            isDisabled={!runtime.data}
            onPress={() =>
              downloadFile(
                exportName('doona-state', 'json'),
                JSON.stringify(
                  {
                    exported_at: new Date().toISOString(),
                    version: version.data,
                    capabilities: capabilities.data,
                    runtime: runtime.data,
                    datapath: datapath.data,
                    memory: memory.data
                  },
                  null,
                  2
                ),
                'application/json'
              )
            }
          >
            <Download />
            {t('ov.export')}
          </Button>
          <LifecycleActions runtime={runtime} capabilities={capabilities.data} />
        </div>
      </div>
      {runtime.error && <ErrorMessage error={runtime.error} onRetry={runtime.refetch} />}
      <div className="rp-g3">
        <section className="rp-card" aria-labelledby="overview-engine">
          <h3 className="rp-h3" id="overview-engine">
            {t('ov.engine')}
          </h3>
          {version.error && <ErrorMessage error={version.error} />}
          {version.data && runtime.data ? (
            <>
              <Kv
                items={[
                  [t('ov.f.engine'), version.data.engine.name + ' ' + version.data.engine.version],
                  [t('ov.f.api'), `${version.data.api.name} v${version.data.api.major} · ${version.data.api.status}`],
                  [t('ov.f.build'), [version.data.build?.revision, version.data.build?.target].filter(Boolean).join(' · ') || '—'],
                  [t('ov.f.instance'), runtime.data.instance_id],
                  [t('ov.f.started'), localTime(runtime.data.lifecycle.started_at, locale)],
                  [t('ov.f.activated'), runtime.data.generation.activated_at ? localTime(runtime.data.generation.activated_at, locale) : '—']
                ]}
              />
              {capabilities.data && (
                <div className="rp-cluster">
                  {capabilities.data.profiles.map(profile => (
                    <Badge key={profile}>{t(profile === 'base' ? 'ov.profileBase' : 'ov.profileFull')}</Badge>
                  ))}
                </div>
              )}
            </>
          ) : capabilities.loading || version.loading || runtime.loading ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-counters">
          <h3 className="rp-h3" id="overview-counters">
            {t('ov.counters')}
          </h3>
          {runtime.data ? (
            <>
              <Kv
                items={[
                  [t('ov.f.tcp'), count(runtime.data.traffic.connections.tcp)],
                  [t('ov.f.udp'), count(runtime.data.traffic.connections.udp)],
                  [t('ov.f.total'), count(runtime.data.traffic.connections.total)],
                  [t('ui.upload'), formatBytes(runtime.data.traffic.bytes.upload)],
                  [t('ui.download'), formatBytes(runtime.data.traffic.bytes.download)],
                  [
                    t('ov.f.rateWindow'),
                    t('ui.seconds', {n: runtime.data.traffic.rates ? formatNumber(runtime.data.traffic.rates.window_seconds, locale, 1) : '—'})
                  ]
                ]}
              />
              <span className="rp-label">
                {t('ov.countersSince', {
                  t: localTime(runtime.data.traffic.counter_since, locale),
                  scope: t(runtime.data.traffic.scope === 'visible' ? 'ov.scopeVisible' : 'ov.scopeAll')
                })}
              </span>
            </>
          ) : capabilities.loading || runtime.loading ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-memory">
          <h3 className="rp-h3" id="overview-memory">
            {t('ov.memory')}
          </h3>
          {memory.error && <ErrorMessage error={memory.error} />}
          {memory.data ? (
            <>
              {cgroupPercent !== null && (
                <Bar
                  label={t('ov.f.cgroupPercent')}
                  value={formatBytes(memory.data.cgroup?.current_bytes ?? null) + ' / ' + formatBytes(memory.data.cgroup?.limit_bytes ?? null)}
                  pct={cgroupPercent}
                  color={cgroupPercent > 90 ? palette.love : cgroupPercent > 75 ? palette.gold : palette.cat[0]}
                />
              )}
              <Kv items={memoryFields(memory.data, t, ['ov.f.cgroupPercent', 'ov.f.cgroupCurrent', 'ov.f.cgroupLimit'])} />
            </>
          ) : capabilities.loading || memory.loading ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
      </div>
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
                  height={250}
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
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
        <section className="rp-card" aria-labelledby="overview-resources">
          <h3 className="rp-h3" id="overview-resources">
            {t('ov.resources')}
          </h3>
          {capabilities.data ? (
            <div className="rp-list rp-list-columns">
              {resourceRows(capabilities.data).map(([key, available]) => (
                <div key={key} className="rp-row">
                  <span>{t(resourceLabels[key])}</span>
                  <Light small tone={available ? 'ok' : 'muted'}>
                    {t(available ? 'ov.available' : 'ov.notAvailable')}
                  </Light>
                </div>
              ))}
            </div>
          ) : capabilities.loading ? (
            <Loading />
          ) : (
            <Empty>{t('ov.unavailable')}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
