import {expect, it} from 'vitest';
import {capabilities, datapath, runtime, runtimeMemory, version} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {datapathFields, datapathValue, memoryFields, overviewExport, overviewView} from './view';
import {formatBytes} from '../../i18n/format';
const t: Translator = (key, params) => translate('en', key, params);
const loading = {capabilities: false, runtime: false, version: false, memory: false, datapath: false};

it('keeps unknown datapath vocabulary and does not invent unknown map occupancy', () => {
  expect(datapathValue('future_backend', t)).toBe('future_backend');
  const value = {...datapath, ebpf: {...datapath.ebpf!, maps: {state: 'ready' as const, conn_state: {occupancy: 0, capacity: 100, occupancy_known: false}}}};
  expect(datapathFields(value, 'unknown', t, 'en-US').find(([label]) => label === t('ov.f.connState'))?.[1]).toBe('unknown');
});

it('marks shared memory as shared and omits selected fields without losing zero counters', () => {
  const fields = memoryFields({...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, scope: 'shared'}}, t, 'en-US', ['ov.f.cgroupLimit']);
  expect(fields.find(([label]) => label === t('ov.f.cgroupScope'))?.[1]).toBe(t('ov.v.cgroupShared'));
  expect(fields.find(([label]) => label === t('ov.f.cgroupLimit'))).toBeUndefined();
  expect(fields.find(([label]) => label === t('ov.f.oomKill'))?.[1]).toBe('0');
});

it('distinguishes loading and unavailable sections and deduplicates datapath errors', () => {
  const view = overviewView({capabilities, runtime, version, datapath, memory: runtimeMemory}, loading, 'en-US', t);
  expect(view.datapath.warning).toBeNull();
  expect(view.datapath.errors.map(error => error.text)).toEqual([t('ui.backend.sampleDelayed')]);
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
    overviewView({runtime: {...runtime, process: {...runtime.process, cpu_percent}}}, loading, locale, label).strip.find(
      ([name]) => name === label('ov.cpu')
    )?.[1];
  expect(cpu(2.1)).toBe('2.1%');
  expect(cpu(1234.56)).toBe('1,234.6%');
  expect(cpu(1234.56, 'de-DE')).toBe('1.234,6%');
  expect(cpu(null)).toBe('—');
  expect(overviewView({}, loading, 'en-US', t).strip).toContainEqual([t('ov.cpu'), '—']);
});
