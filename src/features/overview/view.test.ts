import {expect, it} from 'vitest';
import {capabilities, datapath as healthy, runtime, runtimeMemory, version} from '../../api/mock/fixtures';
import {datapathFault} from '../../api/mock/fixtures/runtime';
import {translate, type Translator} from '../../i18n';
import {datapathFields, datapathValue, memoryFields, overviewExport, overviewView} from './view';
import {formatBytes} from '../../i18n/format';
import type {KvItem} from '../../ui/ui';
const t: Translator = (key, params) => translate('en', key, params);
// The faults scenario's datapath: its one error also stands as the eBPF last error.
const datapath = {
  ...healthy,
  state: 'degraded' as const,
  ebpf: {...healthy.ebpf!, health: 'degraded' as const, last_error: datapathFault.message},
  errors: [datapathFault]
};
const loading = {capabilities: false, runtime: false, version: false, memory: false, datapath: false};
// The row with this label, as an object whichever form it has.
const field = (items: KvItem[], label: string) =>
  items.map(item => (Array.isArray(item) ? {label: item[0], value: item[1], full: undefined, help: undefined} : item)).find(item => item.label === label);

it('keeps unknown datapath vocabulary and does not invent unknown map occupancy', () => {
  expect(datapathValue('future_backend', t)).toBe('future_backend');
  const value = {...datapath, ebpf: {...datapath.ebpf!, maps: {state: 'ready' as const, conn_state: {occupancy: 0, capacity: 100, occupancy_known: false}}}};
  expect(field(datapathFields(value, 'unknown', t, 'en-US'), t('ov.f.connState'))?.value).toBe(t('ov.occupancyUnknown', {capacity: '100'}));
  const noMap = {...datapath, ebpf: {...datapath.ebpf!, maps: {state: 'ready' as const, conn_state: null}}};
  expect(field(datapathFields(noMap, 'unknown', t, 'en-US'), t('ov.f.connState'))?.value).toBe('unknown');
});

it('marks shared memory as shared and omits selected fields without losing zero counters', () => {
  const fields = memoryFields({...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, scope: 'shared'}}, t, 'en-US', ['ov.f.cgroupLimit']);
  expect(field(fields, t('ov.f.cgroupScope'))?.value).toBe(t('ov.v.cgroupShared'));
  expect(field(fields, t('ov.f.cgroupLimit'))).toBeUndefined();
  expect(field(fields, t('ov.f.oomKill'))?.value).toBe('0');
});

it('lists runtime degradations in their own words, an unknown code by the backend message, and nothing when there are none', () => {
  const entry = {code: 'quic_probe_disabled', message: 'm', component: 'quic_probe', since: runtime.observed_at};
  const other = {...entry, code: 'future_issue', message: 'Cannot persist state', component: 'future'};
  const view = overviewView({runtime: {...runtime, degradations: [entry, other]}}, loading, 'en-US', t);
  expect(view.datapath.degradations).toEqual([
    {id: 'quic_probe', tooltip: 'quic_probe_disabled', text: t('ui.backend.quicProbeDisabled')},
    {id: 'future', tooltip: 'future_issue', text: t('ui.backendMessage', {message: 'Cannot persist state'})}
  ]);
  expect(overviewView({runtime: {...runtime, degradations: []}}, loading, 'en-US', t).datapath.degradations).toEqual([]);
  expect(overviewView({runtime: {...runtime, degradations: undefined}}, loading, 'en-US', t).datapath.degradations).toEqual([]);
});

it('distinguishes loading and unavailable sections and deduplicates datapath errors', () => {
  const view = overviewView({capabilities, runtime, version, datapath, memory: runtimeMemory}, loading, 'en-US', t);
  expect(view.datapath.warning).toBeNull();
  expect(view.datapath.errors.map(error => error.text)).toEqual([t('ui.backend.sampleDelayed')]);
  // Each feature that is on opens where it is used.
  expect(view.resources.rows.find(row => row.id === 'dns_cache')?.href).toBe('#/dns?tab=cache');
  expect(view.resources.rows.every(row => row.href.startsWith('#/'))).toBe(true);
  for (const lang of ['zh-TW', 'zh-CN', 'en'] as const) {
    const localized = (key: Parameters<Translator>[0], params?: Parameters<Translator>[1]) => translate(lang, key, params);
    const rendered = overviewView({datapath}, loading, lang, localized);
    expect(rendered.datapath.errors[0].text).toBe(localized('ui.backend.sampleDelayed'));
    const unknown = {...datapath, errors: [{code: 'future_issue', message: 'backend detail'}]};
    expect(overviewView({datapath: unknown}, loading, lang, localized).datapath.errors[0].text).toBe(
      localized('ui.backendMessage', {message: 'backend detail'})
    );
  }
  expect(view.memory.bar?.pct).toBe(25);
  const absent = overviewView({}, {...loading, memory: true}, 'en-US', t);
  expect(absent.engine.state).toBe('unavailable');
  expect(absent.memory.state).toBe('loading');
  expect(absent.canExport).toBe(false);
});

it('shows the version without the runtime and formats counts for the locale', () => {
  const engine = overviewView({version}, loading, 'en-US', t).engine;
  expect(engine.state).toBe('ready');
  expect(engine.fields).toContainEqual([t('ov.f.instance'), '—']);
  const events = {...runtimeMemory.cgroup!.events!, oom: '12345'};
  const fields = memoryFields({...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, events}}, t, 'en-US');
  expect(fields).toContainEqual([t('ov.f.oom'), '12,345']);
  const maps = {state: 'ready' as const, conn_state: {occupancy: 1234, capacity: 65536, occupancy_known: true}};
  expect(datapathFields({...datapath, ebpf: {...datapath.ebpf!, maps}}, 'unknown', t, 'en-US')).toContainEqual([t('ov.f.connState'), '1,234 / 65,536']);
  // A fraction follows the locale: a full-width slash in Chinese.
  const zh: Translator = (key, params) => translate('zh-TW', key, params);
  expect(datapathFields({...datapath, ebpf: {...datapath.ebpf!, maps}}, 'unknown', zh, 'zh-TW')).toContainEqual([zh('ov.f.connState'), '1,234／65,536']);
  expect(overviewView({memory: runtimeMemory}, loading, 'zh-TW', zh).memory.bar?.value).toMatch(/^\S+ \S+／\S+ \S+$/);
});

it('exports raw diagnostic snapshots rather than formatted fields', () => {
  expect(JSON.parse(overviewExport({runtime, memory: runtimeMemory}, '2026-01-01T00:00:00Z'))).toEqual({
    exported_at: '2026-01-01T00:00:00Z',
    runtime,
    memory: runtimeMemory
  });
});

it('retains each known cgroup measurement when the other is unknown', () => {
  const current = overviewView(
    {memory: {...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, current_bytes: '83886080', limit_bytes: null}}},
    loading,
    'en-US',
    t
  ).memory;
  expect(current.bar).toBeNull();
  expect(current.fields).toContainEqual([t('ov.f.cgroupCurrent'), formatBytes('83886080', 'en')]);
  expect(current.fields).toContainEqual([t('ov.f.cgroupLimit'), '—']);
  const limit = overviewView(
    {memory: {...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, current_bytes: null, limit_bytes: '83886080'}}},
    loading,
    'en-US',
    t
  ).memory;
  expect(limit.bar).toBeNull();
  expect(limit.fields).toContainEqual([t('ov.f.cgroupCurrent'), '—']);
  expect(limit.fields).toContainEqual([t('ov.f.cgroupLimit'), formatBytes('83886080', 'en')]);
});

it('shows process CPU as a percent of one core, and a dash when unmeasured', () => {
  const cpu = (cpu_percent: number | null, locale = 'en-US', label = t) =>
    field(overviewView({runtime: {...runtime, process: {...runtime.process, cpu_percent}}}, loading, locale, label).strip, label('ov.cpu'))?.value;
  expect(cpu(2.1)).toBe('2.1%');
  expect(cpu(1234.56)).toBe('1,234.6%');
  expect(cpu(1234.56, 'de-DE')).toBe('1.234,6%');
  expect(cpu(null)).toBe('—');
  expect(overviewView({}, loading, 'en-US', t).strip).toContainEqual([t('ov.cpu'), '—']);
});

it('explains a degraded datapath by whether the runtime is degraded too, and an unconfirmed value', () => {
  const help = (fields: ReturnType<typeof datapathFields>, key: Parameters<Translator>[0]) => field(fields, t(key))?.help;
  const degraded = {...datapath, state: 'degraded' as const};
  expect(help(datapathFields(degraded, 'unknown', t, 'en-US', true), 'ov.f.state')).toEqual({title: t('ov.v.degraded'), text: t('ov.degradedHelp.runtime')});
  expect(help(datapathFields(degraded, 'unknown', t, 'en-US'), 'ov.f.state')).toEqual({title: t('ov.v.degraded'), text: t('ov.degradedHelp.datapath')});
  const runtimeDegraded = {...runtime, lifecycle: {...runtime.lifecycle, state: 'degraded' as const}};
  const fields = overviewView({runtime: runtimeDegraded, datapath: degraded}, loading, 'en-US', t).datapath.fields;
  expect(help(fields, 'ov.f.state')?.text).toBe(t('ov.degradedHelp.runtime'));
  const unknown = {...datapath, ebpf: {...datapath.ebpf!, maps: undefined}};
  expect(help(datapathFields(unknown, 'unknown', t, 'en-US'), 'ov.f.maps')).toEqual({title: t('ov.v.unknown'), text: t('ov.unknownHelp')});
  expect(help(datapathFields(datapath, 'unknown', t, 'en-US'), 'ov.f.kind')).toBeUndefined();
});

it('reads hooks an engine does not check as not verified, and says why', () => {
  const unchecked = {
    ...healthy,
    ebpf: {...healthy.ebpf!, hooks: 'unknown' as const}
  };
  const view = overviewView({version, datapath: unchecked}, loading, 'en-US', t).datapath;
  expect(field(view.fields, t('ov.f.hooks'))).toMatchObject({
    value: t('ov.v.notVerified'),
    help: {title: t('ov.v.notVerified'), text: t('ov.notVerifiedHelp', {hooks: 'cgroup, sk_lookup, and dae0peer'})}
  });
  // An engine doona does not know gives no reason, so the value stays unknown.
  const other = overviewView({datapath: unchecked}, loading, 'en-US', t).datapath;
  expect(field(other.fields, t('ov.f.hooks'))).toMatchObject({value: t('ov.v.unknown'), help: {title: t('ov.v.unknown'), text: t('ov.unknownHelp')}});
});

it('explains the cgroup scope by its value and leaves out an unknown one', () => {
  for (const [scope, key] of [
    ['service', 'ov.cgroupHelp.service'],
    ['shared', 'ov.cgroupHelp.shared']
  ] as const) {
    const row = field(memoryFields({...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, scope}}, t, 'en-US'), t('ov.f.cgroupScope'));
    expect(row?.help).toEqual({title: t('ov.f.cgroupScope'), text: t('ui.valuePair', {label: row!.value, value: t(key)})});
  }
  expect(field(memoryFields({...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, scope: 'unknown'}}, t, 'en-US'), t('ov.f.cgroupScope'))).toBeUndefined();
  expect(field(memoryFields({...runtimeMemory, cgroup: null}, t, 'en-US'), t('ov.f.cgroupScope'))?.help).toBeUndefined();
});

it('says a reported null cgroup limit is no limit and leaves out uncollected kernel memory', () => {
  const unlimited = {...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, limit_bytes: null}, kernel: null};
  const fields = overviewView({capabilities, memory: unlimited}, loading, 'en-US', t).memory.fields;
  expect(fields).toContainEqual([t('ov.f.cgroupLimit'), t('ov.noLimit')]);
  expect(field(fields, t('ov.f.ebpfBytes'))).toBeUndefined();
  // Without the metric in the capabilities, a null limit is only missing.
  const unreported = {...capabilities, resources: {...capabilities.resources, runtime_memory: {available: true, metrics: []}}};
  expect(overviewView({capabilities: unreported, memory: unlimited}, loading, 'en-US', t).memory.fields).toContainEqual([t('ov.f.cgroupLimit'), '—']);
  expect(field(memoryFields(runtimeMemory, t, 'en-US'), t('ov.f.ebpfBytes'))?.value).toBe(formatBytes('18874368', 'en-US'));
});

it('shows only the capacity of maps whose occupancy is not read and leaves out partial eBPF visibility', () => {
  const maps = {state: 'partial' as const, conn_state: {occupancy: null, capacity: 524288, occupancy_known: false}};
  const fields = datapathFields({...datapath, visibility: 'partial', ebpf: {...datapath.ebpf!, maps}}, 'unknown', t, 'en-US');
  expect(fields).toContainEqual([t('ov.f.maps'), t('ov.mapCapacity', {capacity: '524,288'})]);
  expect(t('ov.mapCapacity', {capacity: '524,288'})).toBe('Capacity 524,288');
  expect(field(fields, t('ov.f.connState'))).toBeUndefined();
  expect(field(fields, t('ov.f.visibility'))).toBeUndefined();
  expect(field(datapathFields({...datapath, visibility: 'partial', ebpf: null}, 'unknown', t, 'en-US'), t('ov.f.visibility'))?.value).toBe(t('ov.v.partial'));
});

it('shows the config version, not the generation, and a dash when the backend reports none', () => {
  const strip = (config_revision: string | null) =>
    overviewView({runtime: {...runtime, generation: {...runtime.generation, active_id: 'gen-3', config_revision}}}, loading, 'en-US', t).strip;
  expect(strip('rev-9')[0]).toMatchObject({label: t('ov.config'), value: 'rev-9', full: 'rev-9'});
  expect(strip(null)[0]).toMatchObject({label: t('ov.config'), value: '—', full: '—'});
  expect(t('ov.config')).toBe('Config version');
});

it('puts the cgroup path or hook of a non-interface attachment in the interface cell', () => {
  const attachments = [
    {name: 'honk_sock', kind: 'cgroup' as const, cgroup: '/system.slice', state: 'attached' as const},
    {name: 'honk_verdict', kind: 'other' as const, hook: 'sockmap', state: 'attached' as const}
  ];
  const rows = overviewView({capabilities, datapath: {...healthy, ebpf: {...healthy.ebpf!, attachments}}}, loading, 'en-US', t).datapath.attachments;
  expect(rows.map(row => [row.interface, row.direction])).toEqual([
    ['cgroup: /system.slice', '—'],
    ['Other: sockmap', '—']
  ]);
});
