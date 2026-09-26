import type {Capabilities, Datapath, Runtime, RuntimeMemory, Version} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import type {Key} from '../../i18n';
import {formatDuration, localTime, formatBytes} from '../../i18n/format';
import {lifecycleStates, lifecycleTone, shortId} from '../../api/selectors';
import {parseU64, pctU64} from '../../api/u64';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {backendMessage} from '../../i18n/backend';
const datapathValues: Record<string, Key> = {
  ebpf: 'ov.v.ebpf',
  userspace: 'ov.v.userspace',
  mock: 'ov.v.mock',
  active: 'ov.v.active',
  degraded: 'ov.v.degraded',
  detached: 'ov.v.detached',
  failed: 'ov.v.failed',
  disabled: 'ov.v.disabled',
  full: 'ov.v.full',
  partial: 'ov.v.partial',
  none: 'ov.v.none',
  real: 'ov.v.real',
  loaded: 'ov.v.loaded',
  not_loaded: 'ov.v.notLoaded',
  attached: 'ov.v.attached',
  partially_attached: 'ov.v.partiallyAttached',
  published: 'ov.v.published',
  not_published: 'ov.v.notPublished',
  healthy: 'ov.v.healthy',
  ready: 'ov.v.ready',
  error: 'ov.v.error',
  unknown: 'ov.v.unknown',
  ingress: 'ov.v.ingress',
  egress: 'ov.v.egress'
};
export function datapathValue(value: string, label: LabelFn): string {
  return datapathValues[value] ? label(datapathValues[value]) : value;
}
export function datapathFields(datapath: Datapath, unknown: string, label: LabelFn, locale: string): Array<[string, string]> {
  const ebpf = datapath.ebpf;
  const occupancy = ebpf?.maps?.conn_state;
  const v = (value: string) => datapathValue(value, label);
  return [
    [label('ov.f.kind'), v(datapath.kind)],
    [label('ov.f.state'), v(datapath.state)],
    [label('ov.f.visibility'), v(datapath.visibility)],
    ...(ebpf
      ? ([
          [label('ov.f.backend'), v(ebpf.backend)],
          [label('ov.f.programs'), v(ebpf.programs)],
          [label('ov.f.hooks'), v(ebpf.hooks)],
          [label('ov.f.routing'), v(ebpf.routing.state)],
          [label('ov.f.health'), v(ebpf.health)],
          [label('ov.f.maps'), v(ebpf.maps?.state ?? 'unknown')],
          [
            label('ov.f.connState'),
            occupancy?.occupancy_known && occupancy.occupancy !== null
              ? label('ui.fraction', {part: formatNumber(occupancy.occupancy, locale), whole: formatNumber(occupancy.capacity, locale)})
              : unknown
          ]
        ] as Array<[string, string]>)
      : [])
  ];
}
const cgroupScopes: Record<'service' | 'shared' | 'unknown', Key> = {service: 'ov.v.cgroupService', shared: 'ov.v.cgroupShared', unknown: 'ui.unknown'};
export function memoryFields(memory: RuntimeMemory, label: LabelFn, locale: string, omit: Key[] = []): Array<[string, string]> {
  const count = (value: string | null | undefined) => {
    const parsed = parseU64(value ?? null);
    return parsed === null ? '—' : formatNumber(parsed, locale);
  };
  const rows: Array<[Key, string]> = [
    ['ov.f.rss', formatBytes(memory.process?.rss_bytes ?? null, locale)],
    ['ov.f.cgroupCurrent', formatBytes(memory.cgroup?.current_bytes ?? null, locale)],
    ['ov.f.cgroupLimit', formatBytes(memory.cgroup?.limit_bytes ?? null, locale)],
    // Distinguish service, shared, and unknown cgroups so shared usage is not attributed solely to the engine.
    ['ov.f.cgroupScope', memory.cgroup ? label(cgroupScopes[memory.cgroup.scope]) : '—'],
    ['ov.f.oomHigh', count(memory.cgroup?.events?.high)],
    ['ov.f.oom', count(memory.cgroup?.events?.oom)],
    ['ov.f.oomKill', count(memory.cgroup?.events?.oom_kill)],
    ['ov.f.ebpfBytes', formatBytes(memory.kernel?.ebpf_bytes ?? null, locale)]
  ];
  return rows.filter(([key]) => !omit.includes(key)).map(([key, value]) => [label(key), value]);
}

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

export function overviewView(
  data: {capabilities?: Capabilities; runtime?: Runtime; version?: Version; memory?: RuntimeMemory; datapath?: Datapath},
  loading: {capabilities: boolean; runtime: boolean; version: boolean; memory: boolean; datapath: boolean},
  locale: string,
  t: LabelFn
) {
  const {capabilities, runtime, version, memory, datapath} = data;
  const state = runtime?.lifecycle.state;
  const revision = runtime?.generation.config_revision ?? runtime?.generation.active_id ?? '—';
  const reload = runtime?.last_reload;
  // Percent of one CPU, so a busy engine on several cores can pass 100.
  const cpu = runtime?.process.cpu_percent;
  const percent = pctU64(memory?.cgroup?.current_bytes ?? null, memory?.cgroup?.limit_bytes ?? null);
  const count = (value: number | null) => (value === null ? '—' : formatNumber(value, locale));
  const section = (present: boolean, busy: boolean) => (present ? ('ready' as const) : busy ? ('loading' as const) : ('unavailable' as const));
  return {
    status: {
      tone: lifecycleTone(state) as 'ok' | 'err' | 'warn',
      text: state ? enumLabel(lifecycleStates, state, t) : t(loading.capabilities || loading.runtime ? 'ov.loading' : 'ov.unknown')
    },
    strip: [
      [t('ov.config'), shortId(revision), revision],
      [t('ov.uptime'), formatDuration(runtime?.lifecycle.uptime_seconds ?? null, locale)],
      [t('ov.cpu'), cpu == null ? '—' : t('ui.percent', {n: formatNumber(cpu, locale, 1)})],
      [t('ov.lastReload'), reload ? localTime(reload.finished_at, locale) : '—']
    ] as Array<[string, string] | [string, string, string]>,
    reload: reload
      ? {
          tooltip: reload.operation_id,
          tone: reload.status === 'succeeded' ? ('ok' as const) : reload.status === 'failed' ? ('err' as const) : ('warn' as const),
          text: t(reload.status === 'succeeded' ? 'ov.succeeded' : reload.status === 'failed' ? 'ov.failed' : 'ov.running')
        }
      : null,
    engine: {
      // The version stands on its own: a failing runtime leaves its rows at a dash rather than hiding the build.
      state: section(!!version, loading.version),
      fields: version
        ? ([
            [t('ov.f.engine'), version.engine.name + ' ' + version.engine.version],
            [t('ov.f.api'), t('ui.apiVersion', {name: version.api.name, major: version.api.major, status: version.api.status})],
            [t('ov.f.build'), [version.build?.revision, version.build?.target].filter(Boolean).join(t('ui.separator')) || '—'],
            [t('ov.f.instance'), runtime?.instance_id ?? '—'],
            [t('ov.f.started'), localTime(runtime?.lifecycle.started_at ?? null, locale)],
            [t('ov.f.activated'), localTime(runtime?.generation.activated_at ?? null, locale)]
          ] as Array<[string, string]>)
        : [],
      profiles: capabilities?.profiles.map(id => ({id, text: t(id === 'base' ? 'ov.profileBase' : 'ov.profileFull')})) ?? []
    },
    counters: {
      state: section(!!runtime, loading.capabilities || loading.runtime),
      fields: runtime
        ? ([
            [t('ov.f.tcp'), count(runtime.traffic.connections.tcp)],
            [t('ov.f.udp'), count(runtime.traffic.connections.udp)],
            [t('ov.f.total'), count(runtime.traffic.connections.total)],
            [t('ui.upload'), formatBytes(runtime.traffic.bytes.upload, locale)],
            [t('ui.download'), formatBytes(runtime.traffic.bytes.download, locale)],
            [t('ov.f.rateWindow'), runtime.traffic.rates ? t('ui.seconds', {n: formatNumber(runtime.traffic.rates.window_seconds, locale, 1)}) : '—']
          ] as Array<[string, string]>)
        : [],
      since: runtime
        ? t('ov.countersSince', {
            t: localTime(runtime.traffic.counter_since, locale),
            scope: t(runtime.traffic.scope === 'visible' ? 'ov.scopeVisible' : 'ov.scopeAll')
          })
        : ''
    },
    memory: {
      state: section(!!memory, loading.capabilities || loading.memory),
      fields: memory ? memoryFields(memory, t, locale, percent === null ? [] : ['ov.f.cgroupCurrent', 'ov.f.cgroupLimit']) : [],
      bar:
        percent === null
          ? null
          : {
              label: t('ov.f.cgroupPercent'),
              value: t('ui.fraction', {
                part: formatBytes(memory?.cgroup?.current_bytes ?? null, locale),
                whole: formatBytes(memory?.cgroup?.limit_bytes ?? null, locale)
              }),
              pct: percent,
              tone: percent > 90 ? ('err' as const) : percent > 75 ? ('warn' as const) : ('ok' as const)
            }
    },
    datapath: {
      state: section(!!datapath, loading.capabilities || loading.datapath),
      fields: datapath ? datapathFields(datapath, t('ov.unknown'), t, locale) : [],
      showAttachments: !!datapath?.ebpf,
      attachments: (datapath?.ebpf?.attachments ?? []).map((a, i) => ({
        id: String(i),
        name: a.name,
        interface: a.interface,
        direction: datapathValue(a.direction, t),
        state: datapathValue(a.state, t)
      })),
      errors: datapath?.errors.map(error => ({tooltip: error.code, text: backendMessage(error.code, error.message, t)})) ?? [],
      warning:
        datapath?.ebpf?.last_error && !datapath.errors.some(error => error.message === datapath.ebpf?.last_error)
          ? t('ui.backendMessage', {message: datapath.ebpf.last_error})
          : null
    },
    resources: {
      state: section(!!capabilities, loading.capabilities),
      rows: capabilities
        ? (Object.keys(resourceLabels) as Array<keyof typeof resourceLabels>)
            .map(id => {
              const available = capabilities.resources[id].available !== false;
              return {
                id,
                label: t(resourceLabels[id]),
                tone: available ? ('ok' as const) : ('muted' as const),
                text: t(available ? 'ov.available' : 'ov.notAvailable'),
                // Most rows are available, so their status is the dot alone and only the exceptions are spelled out;
                // the text still reaches assistive technology.
                dotOnly: available
              };
            })
            .sort((a, b) => Number(a.tone === 'muted') - Number(b.tone === 'muted'))
        : []
    },
    canExport: !!runtime
  };
}

export function overviewExport(
  data: {capabilities?: Capabilities; runtime?: Runtime; version?: Version; memory?: RuntimeMemory; datapath?: Datapath},
  exportedAt: string
) {
  return JSON.stringify({exported_at: exportedAt, ...data}, null, 2);
}
