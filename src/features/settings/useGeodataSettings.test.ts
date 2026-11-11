import {beforeEach, expect, it, vi} from 'vitest';
import type * as React from 'react';
import type * as I18n from '../../i18n';
import type {GeoDataSettings} from '../../api/model';
import {capabilities} from '../../../mock/fixtures';
import {hookHarness} from '../../store/testHelpers';
import {useGeodataSettings} from './useGeodataSettings';

vi.mock('react', async original => ({...(await original<typeof React>()), ...hookHarness.hooks}));
vi.mock('../../store', () => ({
  useCapabilities: () => ({data: capabilities}),
  useVersion: () => ({data: undefined}),
  useRuntimeSettings: () => settings,
  useGeodata: () => ({data: undefined, loading: false, busy: false, error: null, refetch: vi.fn(), update: vi.fn()}),
  useGroups: () => ({data: [], error: null, refetch: vi.fn()})
}));
vi.mock('../../ui/clock', () => ({useNow: () => 0}));
vi.mock('../../ui/ui', () => ({toast: vi.fn(), toastErrorDetail: () => ({})}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof I18n>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});

const settings = {
  data: undefined as {geodata: GeoDataSettings} | undefined,
  loading: false,
  busy: false,
  error: null,
  refetch: vi.fn(),
  save: vi.fn()
};
const read = (auto_update: GeoDataSettings['auto_update']) => {
  settings.data = {geodata: {source: 'default', geosite: {urls: []}, geoip: {urls: []}, download: {route: 'routing', group_id: null}, auto_update}};
  return hookHarness.render(() => useGeodataSettings()).auto;
};
const saved = () => settings.save.mock.calls.map(([patch]) => patch);

beforeEach(() => {
  hookHarness.reset();
  settings.save.mockReset().mockReturnValue(new Promise(() => {}));
});

it('saves a daily hour as a cron expression, and nothing for the stored hour', () => {
  const auto = read({enabled: true, interval_hours: 24, cron: '0 3 * * *'});
  expect(auto.schedule).toEqual({kind: 'daily', hour: 3});
  auto.pickHour('3');
  expect(saved()).toEqual([]);
  auto.pickHour('0');
  expect(saved()).toEqual([{geodata: {auto_update: {cron: '0 0 * * *'}}}]);
});

it('switches an interval to daily at 03:00 and a cron schedule back to the default interval', () => {
  const interval = read({enabled: true, interval_hours: 48, cron: null});
  expect(interval.schedule).toEqual({kind: 'interval'});
  interval.toDaily();
  expect(saved()).toEqual([{geodata: {auto_update: {cron: '0 3 * * *'}}}]);
  hookHarness.reset();
  settings.save.mockClear();
  read({enabled: true, interval_hours: 24, cron: '0 3 * * *'}).toInterval();
  expect(saved()).toEqual([{geodata: {auto_update: {interval_hours: 24}}}]);
});

it('shows another expression as it is, and keeps the interval alone for a backend without cron', () => {
  expect(read({enabled: true, interval_hours: 24, cron: '30 4 * * 1-5'}).schedule).toEqual({kind: 'custom', cron: '30 4 * * 1-5'});
  hookHarness.reset();
  const old = read({enabled: true, interval_hours: 24});
  expect(old.schedule).toEqual({kind: 'unsupported'});
  old.pick('72');
  expect(saved()).toEqual([{geodata: {auto_update: {interval_hours: 72}}}]);
});
