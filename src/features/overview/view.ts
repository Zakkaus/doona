import type {Capabilities, Datapath, Runtime, RuntimeMemory, Version} from '../../api/model';
import type {Key} from '../../i18n';
import {formatDuration, localTime, formatBytes} from '../../i18n/format';
import {memoryTone, shortId} from '../../api/selectors';
import {parseU64, pctU64} from '../../api/u64';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {backendMessage, oneLine} from '../../i18n/backend';
import type {Help, KvItem} from '../../ui/ui';
import {resourceLabels, type LimitGroup} from '../shared/limits';
import {engineStatus} from '../shared/engineStatus';
import {engineOf} from '../../api/engines';
import {href} from '../../shell/route';
// Where each feature is used, so the list of features that are on opens them.
const resourcePages: Record<keyof typeof resourceLabels, string> = {
  connections: href('connections', {tab: 'list'}),
  flows: href('flows', {tab: 'records'}),
  routing_trace: href('rules', {tab: 'trace'}),
  dns_query: href('dns', {tab: 'query'}),
  dns_cache: href('dns', {tab: 'cache'}),
  dns_log: href('dns', {tab: 'log'}),
  events: href('events'),
  probes: href('nodes', {tab: 'latency'}),
  traffic_history: href('activity'),
  memory_history: href('activity'),
  runtime_outbounds: href('activity'),
  logs: href('logs'),
  providers: href('nodes'),
  rules: href('rules', {tab: 'list'}),
  config: href('config'),
  config_validate: href('config', {tab: 'validate'}),
  runtime_settings: href('settings', {card: 'runtime'}),
  geodata: href('settings', {card: 'geodata'})
};
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
// A degraded or an unknown value is explained beside its label. A runtime that is degraded as well means a reload
// left the datapath unrecovered, which is what the explanation then describes.
function valueHelp(value: string, runtimeDegraded: boolean, label: LabelFn): Help | undefined {
  if (value === 'degraded') return {title: label('ov.v.degraded'), text: label(runtimeDegraded ? 'ov.degradedHelp.runtime' : 'ov.degradedHelp.datapath')};
  if (value === 'unknown') return {title: label('ov.v.unknown'), text: label('ov.unknownHelp')};
  return undefined;
}
// A hook state the engine reports as `unknown` because it does not check those hooks reads as not verified, with why.
function hookHelp(value: string, unchecked: string[], label: LabelFn, locale: string): Help | undefined {
  if (value !== 'unknown' || !unchecked.length) return undefined;
  const hooks = new Intl.ListFormat(locale, {type: 'conjunction'}).format(unchecked);
  return {title: label('ov.v.notVerified'), text: label('ov.notVerifiedHelp', {hooks})};
}
export function datapathFields(
  datapath: Datapath,
  unknown: string,
  label: LabelFn,
  locale: string,
  runtimeDegraded = false,
  unchecked: string[] = []
): KvItem[] {
  const ebpf = datapath.ebpf;
  const occupancy = ebpf?.maps?.conn_state;
  const row = (key: Key, value: string): KvItem => {
    const help = valueHelp(value, runtimeDegraded, label);
    return help ? {label: label(key), value: datapathValue(value, label), help} : [label(key), datapathValue(value, label)];
  };
  const maps = ebpf?.maps?.state ?? 'unknown';
  const hooks = ebpf && hookHelp(ebpf.hooks, unchecked, label, locale);
  return [
    row('ov.f.kind', datapath.kind),
    row('ov.f.state', datapath.state),
    // The eBPF backend checks only the hooks on host interfaces, so its partial visibility says nothing and is left out.
    ...(datapath.visibility === 'partial' && ebpf ? [] : [row('ov.f.visibility', datapath.visibility)]),
    ...(ebpf
      ? [
          row('ov.f.backend', ebpf.backend),
          row('ov.f.programs', ebpf.programs),
          hooks ? {label: label('ov.f.hooks'), value: label('ov.v.notVerified'), help: hooks} : row('ov.f.hooks', ebpf.hooks),
          row('ov.f.routing', ebpf.routing.state),
          row('ov.f.health', ebpf.health),
          // Maps that are partial only because the occupancy is not read show just the capacity.
          ...(maps === 'partial' && occupancy && !occupancy.occupancy_known
            ? [[label('ov.f.maps'), label('ov.mapCapacity', {capacity: formatNumber(occupancy.capacity, locale)})] as KvItem]
            : [
                row('ov.f.maps', maps),
                [
                  label('ov.f.connState'),
                  occupancy?.occupancy_known && occupancy.occupancy !== null
                    ? label('ui.fraction', {part: formatNumber(occupancy.occupancy, locale), whole: formatNumber(occupancy.capacity, locale)})
                    : occupancy
                      ? label('ov.occupancyUnknown', {capacity: formatNumber(occupancy.capacity, locale)})
                      : unknown
                ] as KvItem
              ])
        ]
      : [])
  ];
}
const cgroupScopes: Record<'service' | 'shared', Key> = {service: 'ov.v.cgroupService', shared: 'ov.v.cgroupShared'};
const cgroupHelp: Record<'service' | 'shared', Key> = {service: 'ov.cgroupHelp.service', shared: 'ov.cgroupHelp.shared'};
// `limitReported` is whether the capabilities list the cgroup limit, so a null limit means none is set.
export function memoryFields(memory: RuntimeMemory, label: LabelFn, locale: string, omit: Key[] = [], limitReported = false): KvItem[] {
  const scope = memory.cgroup?.scope;
  const count = (value: string | null | undefined) => {
    const parsed = parseU64(value ?? null);
    return parsed === null ? '—' : formatNumber(parsed, locale);
  };
  const rows: Array<[Key, string]> = [
    ['ov.f.rss', formatBytes(memory.process?.rss_bytes ?? null, locale)],
    ['ov.f.cgroupCurrent', formatBytes(memory.cgroup?.current_bytes ?? null, locale)],
    ['ov.f.cgroupLimit', limitReported && memory.cgroup?.limit_bytes === null ? label('ov.noLimit') : formatBytes(memory.cgroup?.limit_bytes ?? null, locale)],
    // Distinguish service and shared cgroups so shared usage is not attributed solely to the engine.
    ['ov.f.cgroupScope', scope && scope !== 'unknown' ? label(cgroupScopes[scope]) : '—'],
    ['ov.f.oomHigh', count(memory.cgroup?.events?.high)],
    ['ov.f.oom', count(memory.cgroup?.events?.oom)],
    ['ov.f.oomKill', count(memory.cgroup?.events?.oom_kill)],
    ['ov.f.ebpfBytes', formatBytes(memory.kernel?.ebpf_bytes ?? null, locale)]
  ];
  // An unknown scope and an uncollected kernel figure have nothing to show, so their rows are left out.
  const hidden: Key[] = [...omit, ...(scope === 'unknown' ? ['ov.f.cgroupScope' as const] : []), ...(memory.kernel ? [] : ['ov.f.ebpfBytes' as const])];
  return rows
    .filter(([key]) => !hidden.includes(key))
    .map(([key, value]): KvItem =>
      key === 'ov.f.cgroupScope' && scope && scope !== 'unknown'
        ? {label: label(key), value, help: {title: label(key), text: label('ui.valuePair', {label: value, value: label(cgroupHelp[scope])})}}
        : [label(key), value]
    );
}

export function overviewView(
  // `limits` is backendLimits for the capabilities; the controller builds it because its links need the UI language.
  data: {capabilities?: Capabilities; runtime?: Runtime; version?: Version; memory?: RuntimeMemory; datapath?: Datapath; limits?: LimitGroup[]},
  loading: {capabilities: boolean; runtime: boolean; version: boolean; memory: boolean; datapath: boolean},
  locale: string,
  t: LabelFn
) {
  const {capabilities, runtime, version, memory, datapath, limits = []} = data;
  const unchecked = engineOf(version).uncheckedHooks;
  const state = runtime?.lifecycle.state;
  const revision = runtime?.generation.config_revision ?? runtime?.generation.active_id ?? '—';
  const reload = runtime?.last_reload;
  // Percent of one CPU, so a busy engine on several cores can pass 100.
  const cpu = runtime?.process.cpu_percent;
  const percent = pctU64(memory?.cgroup?.current_bytes ?? null, memory?.cgroup?.limit_bytes ?? null);
  const count = (value: number | null) => (value === null ? '—' : formatNumber(value, locale));
  const section = (present: boolean, busy: boolean) => (present ? ('ready' as const) : busy ? ('loading' as const) : ('unavailable' as const));
  return {
    status: engineStatus(state, datapath?.state, t(loading.capabilities || loading.runtime ? 'ov.loading' : 'ov.unknown'), t),
    strip: [
      {label: t('ov.config'), value: shortId(revision), full: revision, help: {title: t('ov.config'), text: t('ov.configHelp')}},
      [t('ov.uptime'), formatDuration(runtime?.lifecycle.uptime_seconds ?? null, locale)],
      [t('ov.cpu'), cpu == null ? '—' : t('ui.percent', {n: formatNumber(cpu, locale, 1)})],
      [t('ov.lastReload'), reload ? localTime(reload.finished_at, locale) : '—']
    ] as KvItem[],
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
            {
              label: t('ov.f.rateWindow'),
              value: runtime.traffic.rates ? t('ui.seconds', {n: formatNumber(runtime.traffic.rates.window_seconds, locale, 1)}) : '—',
              help: {title: t('ov.f.rateWindow'), text: t('ov.rateWindowHelp')}
            }
          ] as KvItem[])
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
      fields: memory
        ? memoryFields(
            memory,
            t,
            locale,
            percent === null ? [] : ['ov.f.cgroupCurrent', 'ov.f.cgroupLimit'],
            !!capabilities?.resources.runtime_memory.metrics?.includes('cgroup.limit_bytes')
          )
        : [],
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
              tone: memoryTone(percent)
            }
    },
    datapath: {
      state: section(!!datapath, loading.capabilities || loading.datapath),
      fields: datapath ? datapathFields(datapath, t('ov.unknown'), t, locale, state === 'degraded', unchecked) : [],
      showAttachments: !!datapath?.ebpf,
      attachments: (datapath?.ebpf?.attachments ?? []).map((a, i) => ({
        id: String(i),
        name: a.name,
        interface: a.interface,
        direction: datapathValue(a.direction, t),
        state: datapathValue(a.state, t)
      })),
      errors: datapath?.errors.map(error => ({tooltip: error.code, text: oneLine(backendMessage(error.code, error.message, t), t)})) ?? [],
      warning:
        datapath?.ebpf?.last_error && !datapath.errors.some(error => error.message === datapath.ebpf?.last_error)
          ? t('ui.backendMessage', {message: datapath.ebpf.last_error})
          : null,
      // Features the engine keeps running reduced. The runtime reports them, so they show whether or not the datapath
      // was read; they sit with its warnings. An unknown code shows the backend's message.
      degradations: runtime?.degradations?.map(d => ({id: d.component, tooltip: d.code, text: oneLine(backendMessage(d.code, d.message, t), t)})) ?? []
    },
    resources: {
      state: section(!!capabilities, loading.capabilities),
      // Only the features that are fully on, as dots; the ones that are off or limited have their own card.
      rows: capabilities
        ? (Object.keys(resourceLabels) as Array<keyof typeof resourceLabels>)
            .filter(id => !limits.some(group => group.items.some(item => item.id === id)))
            .map(id => ({id, label: t(resourceLabels[id]), text: t('ov.available'), href: resourcePages[id]}))
        : []
    },
    limits,
    canExport: !!runtime
  };
}

export function overviewExport(
  data: {capabilities?: Capabilities; runtime?: Runtime; version?: Version; memory?: RuntimeMemory; datapath?: Datapath},
  exportedAt: string
) {
  return JSON.stringify({exported_at: exportedAt, ...data}, null, 2);
}
