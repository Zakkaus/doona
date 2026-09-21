import {expect, it, vi} from 'vitest';
import {capabilities, datapath, runtime, runtimeMemory, version} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {datapathFields, datapathValue, lifecycleActions, memoryFields, overviewExport, overviewView} from './view';
const t: Translator = (key, params) => translate('en', key, params);
const loading = {capabilities: false, runtime: false, version: false, memory: false, datapath: false};

it('keeps unknown datapath vocabulary and does not invent unknown map occupancy', () => {
  expect(datapathValue('future_backend', t)).toBe('future_backend');
  const value = {...datapath, ebpf: {...datapath.ebpf!, maps: {state: 'ready' as const, conn_state: {occupancy: 0, capacity: 100, occupancy_known: false}}}};
  expect(datapathFields(value, 'unknown', t).find(([label]) => label === t('ov.f.connState'))?.[1]).toBe('unknown');
});

it('marks shared memory as shared and omits selected fields without losing zero counters', () => {
  const fields = memoryFields({...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, scope: 'shared'}}, t, ['ov.f.cgroupPercent']);
  expect(fields.find(([label]) => label === t('ov.f.cgroupScope'))?.[1]).toBe(t('ov.v.cgroupShared'));
  expect(fields.find(([label]) => label === t('ov.f.cgroupPercent'))).toBeUndefined();
  expect(fields.find(([label]) => label === t('ov.f.oomKill'))?.[1]).toBe('0');
});

it('distinguishes loading and unavailable sections and deduplicates datapath errors', () => {
  const view = overviewView({capabilities, runtime, version, datapath, memory: runtimeMemory}, loading, 'en-US', t);
  expect(view.datapath.warning).toBeNull();
  expect(view.datapath.errors.map(error => error.text)).toEqual(['Routing map sample delayed']);
  expect(view.memory.bar?.pct).toBe(25);
  const absent = overviewView({}, {...loading, memory: true}, 'en-US', t);
  expect(absent.engine.state).toBe('unavailable');
  expect(absent.memory.state).toBe('loading');
  expect(absent.canExport).toBe(false);
});

it('retains a pending operation even when lifecycle state stops offering it', () => {
  const run = vi.fn();
  const actions = lifecycleActions(kind => kind === 'resume', 'suspend', run, t);
  expect(actions.map(action => [action.id, action.pending, action.disabled])).toEqual([
    ['suspend', true, true],
    ['resume', false, true]
  ]);
  actions[1].run();
  expect(run).toHaveBeenCalledWith('resume');
});

it('exports raw diagnostic snapshots rather than formatted fields', () => {
  expect(JSON.parse(overviewExport({runtime, memory: runtimeMemory}, '2026-01-01T00:00:00Z'))).toEqual({
    exported_at: '2026-01-01T00:00:00Z',
    runtime,
    memory: runtimeMemory
  });
});
