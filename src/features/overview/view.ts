import type {Datapath, RuntimeMemory} from '../../api/model';
import type {Key} from '../../i18n/messages';
import type {LabelFn} from '../../api/selectors';
import {formatBytes, pctU64} from '../../api/u64';
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
export function datapathFields(datapath: Datapath, unknown: string, label: LabelFn): Array<[string, string]> {
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
          [label('ov.f.connState'), occupancy?.occupancy_known && occupancy.occupancy !== null ? occupancy.occupancy + ' / ' + occupancy.capacity : unknown]
        ] as Array<[string, string]>)
      : [])
  ];
}
const cgroupScopes: Record<'service' | 'shared' | 'unknown', Key> = {service: 'ov.v.cgroupService', shared: 'ov.v.cgroupShared', unknown: 'ui.unknown'};
export function memoryFields(memory: RuntimeMemory, label: LabelFn, omit: Key[] = []): Array<[string, string]> {
  const percent = pctU64(memory.cgroup?.current_bytes ?? null, memory.cgroup?.limit_bytes ?? null);
  const rows: Array<[Key, string]> = [
    ['ov.f.rss', formatBytes(memory.process?.rss_bytes ?? null)],
    ['ov.f.cgroupCurrent', formatBytes(memory.cgroup?.current_bytes ?? null)],
    ['ov.f.cgroupLimit', formatBytes(memory.cgroup?.limit_bytes ?? null)],
    ['ov.f.cgroupPercent', percent === null ? '—' : Math.round(percent) + '%'],
    // Distinguish service, shared, and unknown cgroups so shared usage is not attributed solely to the engine.
    ['ov.f.cgroupScope', memory.cgroup ? label(cgroupScopes[memory.cgroup.scope]) : '—'],
    ['ov.f.oomHigh', memory.cgroup?.events?.high ?? '—'],
    ['ov.f.oom', memory.cgroup?.events?.oom ?? '—'],
    ['ov.f.oomKill', memory.cgroup?.events?.oom_kill ?? '—'],
    ['ov.f.ebpfBytes', formatBytes(memory.kernel?.ebpf_bytes ?? null)]
  ];
  return rows.filter(([key]) => !omit.includes(key)).map(([key, value]) => [label(key), value]);
}
