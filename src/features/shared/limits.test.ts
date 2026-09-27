import {describe, expect, it} from 'vitest';
import type {Capabilities, Version} from '../../api/model';
import {capabilities, version} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {backendLimits} from './limits';
const t: Translator = (key, params) => translate('en', key, params);
const other = {...version, api: {...version.api, name: 'other/backend'}} as unknown as Version;
type Resources = Capabilities['resources'];
const patched = (patch: {[K in keyof Resources]?: Partial<Resources[K]>}): Capabilities => ({
  ...capabilities,
  resources: Object.fromEntries(
    Object.entries(capabilities.resources).map(([id, resource]) => [id, {...resource, ...patch[id as keyof Resources]}])
  ) as Resources
});
const find = (limits: ReturnType<typeof backendLimits>, id: string) => limits.find(limit => limit.id === id);

describe('backendLimits', () => {
  it('lists nothing when every feature is on', () => {
    expect(backendLimits(capabilities, version, t)).toEqual([]);
  });

  it('reports a missing configuration without a setting', () => {
    const config = find(backendLimits(patched({config: {available: false}}), version, t), 'config');
    expect(config).toMatchObject({state: t('ov.lim.notLoaded'), reason: t('ov.lim.configMissing'), keys: []});
  });

  it('names what configuration writes require on honk and only the state elsewhere', () => {
    const readOnly = patched({config: {writable: false}});
    expect(find(backendLimits(readOnly, version, t), 'config')).toMatchObject({
      state: t('config.readOnly'),
      reason: t('ov.lim.configWrite'),
      keys: ['experimental.native_api.config_write: true', 'experimental.native_api.secret', 'experimental.native_api.password_auth: true']
    });
    expect(find(backendLimits(patched({config: {writable: undefined}}), version, t), 'config')?.state).toBe(t('config.readOnly'));
    expect(find(backendLimits(readOnly, other, t), 'config')).toMatchObject({reason: t('ov.lim.notProvided'), keys: []});
    expect(find(backendLimits(readOnly, undefined, t), 'config')?.keys).toEqual([]);
  });

  it('points each recorder at its honk switch', () => {
    const off = patched({traffic_history: {available: false}, memory_history: {available: false}, logs: {available: false}, dns_log: {available: false}});
    const limits = backendLimits(off, version, t);
    for (const [id, key] of [
      ['traffic_history', 'record_traffic'],
      ['memory_history', 'record_memory'],
      ['logs', 'record_logs'],
      ['dns_log', 'record_dns_log']
    ]) {
      expect(find(limits, id)).toMatchObject({state: t('ov.lim.notRecorded'), reason: t('ov.lim.recordOff'), keys: [`experimental.native_api.${key}: true`]});
      expect(find(backendLimits(off, other, t), id)).toMatchObject({reason: t('ov.lim.notProvided'), keys: []});
    }
  });

  it('sends flows that are not recording to the runtime settings, with the honk default', () => {
    const off = patched({flows: {recording: 'off'}});
    expect(find(backendLimits(off, version, t), 'flows')).toMatchObject({
      state: t('ov.lim.notRecorded'),
      reason: t('ov.lim.flowsSwitchDefault'),
      keys: ['experimental.native_api.record_flows: true'],
      link: {href: '#/settings?card=runtime', text: t('settings.runtime')}
    });
    expect(find(backendLimits(off, other, t), 'flows')).toMatchObject({reason: t('ov.lim.flowsSwitch'), keys: []});
    const fixed = patched({flows: {recording: 'off'}, runtime_settings: {fields: ['log.level']}});
    expect(find(backendLimits(fixed, version, t), 'flows')).toMatchObject({reason: t('ov.lim.recordOff'), link: undefined});
    expect(find(backendLimits(patched({flows: {recording: 'sampled'}}), version, t), 'flows')).toBeUndefined();
  });

  it('explains geodata that cannot update by the first missing piece', () => {
    const stuck = {available: true, can_update: false} as const;
    expect(find(backendLimits(patched({geodata: stuck, config: {writable: false}}), version, t), 'geodata')).toMatchObject({
      state: t('ov.lim.noUpdate'),
      reason: t('ov.lim.geoNeedsConfig'),
      keys: []
    });
    const noSources = patched({geodata: {...stuck, configurable_sources: false}});
    expect(find(backendLimits(noSources, version, t), 'geodata')).toMatchObject({
      reason: t('ov.lim.geoNoSources'),
      keys: ['experimental.native_api.geosite_download_url', 'experimental.native_api.geoip_download_url', '<data_dir>/state/honk.db']
    });
    expect(find(backendLimits(noSources, other, t), 'geodata')).toMatchObject({reason: t('ov.lim.notProvided'), keys: []});
    expect(find(backendLimits(patched({geodata: {...stuck, configurable_sources: true}}), version, t), 'geodata')).toMatchObject({
      reason: t('ov.lim.geoNoUrl'),
      link: {href: '#/settings?card=geodata', text: t('settings.geodata')}
    });
  });

  it('reports subscriptions, editing and probes without a setting', () => {
    const limits = backendLimits(patched({providers: {can_refresh: false}, nodes: {can_manage: false}, probes: {available: false}}), version, t);
    expect(find(limits, 'providers')).toMatchObject({
      label: t('ov.lim.subscriptions'),
      state: t('ov.lim.noRefresh'),
      reason: t('ov.lim.subscriptionsOff'),
      keys: []
    });
    expect(find(limits, 'manage')).toMatchObject({label: t('ov.lim.manage'), state: t('ov.lim.noEdit'), reason: t('ov.lim.mainReadOnly'), keys: []});
    expect(find(limits, 'probes')).toMatchObject({state: t('ov.lim.notRunning'), reason: t('ov.lim.probesOff'), keys: []});
    expect(find(backendLimits(patched({providers: {can_manage: false}}), version, t), 'manage')).toBeDefined();
  });

  it('marks any other missing feature as not provided and ignores suspend and resume', () => {
    const limits = backendLimits(patched({events: {available: false}, suspend: {available: false}, resume: {available: false}}), version, t);
    expect(limits.map(limit => limit.id)).toEqual(['events']);
    expect(limits[0]).toMatchObject({label: t('nav.events'), state: t('ov.notAvailable'), reason: t('ov.lim.notProvided'), keys: []});
  });

  it('puts the configuration first', () => {
    const limits = backendLimits(patched({connections: {available: false}, config: {writable: false}}), version, t);
    expect(limits.map(limit => limit.id)).toEqual(['config', 'connections']);
  });
});
