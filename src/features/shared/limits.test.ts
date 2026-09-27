import {describe, expect, it} from 'vitest';
import type {Capabilities, Version} from '../../api/model';
import {capabilities, capabilitiesBase, version} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {backendLimits, limitSnippet, type LimitCause, type LimitGroup} from './limits';
import {docsHref} from './docs';
const t: Translator = (key, params) => translate('en', key, params);
const other = {...version, api: {...version.api, name: 'other/backend'}} as unknown as Version;
type Resources = Capabilities['resources'];
const patched = (patch: {[K in keyof Resources]?: Partial<Resources[K]>}): Capabilities => ({
  ...capabilities,
  resources: Object.fromEntries(
    Object.entries(capabilities.resources).map(([id, resource]) => [id, {...resource, ...patch[id as keyof Resources]}])
  ) as Resources
});
const limits = (caps: Capabilities, backend: Version | undefined = version) => backendLimits(caps, backend, t, 'en');
const group = (groups: LimitGroup[], cause: LimitCause) => groups.find(g => g.cause === cause);
const ids = (g: LimitGroup | undefined) => g?.items.map(item => item.id);

describe('backendLimits', () => {
  it('lists nothing when every feature is on', () => {
    expect(limits(capabilities)).toEqual([]);
  });

  it('merges the honk recorders that are off into one group with one snippet and a restart', () => {
    const off = patched({traffic_history: {available: false}, memory_history: {available: false}, logs: {available: false}, dns_log: {available: false}});
    const recordOff = group(limits(off), 'recordOff');
    expect(recordOff).toMatchObject({reason: t('ov.lim.recordOff'), restart: true});
    expect(ids(recordOff)).toEqual(['dns_log', 'traffic_history', 'memory_history', 'logs']);
    expect(recordOff?.keys).toEqual(['record_dns_log: true', 'record_traffic: true', 'record_memory: true', 'record_logs: true']);
    expect(recordOff?.items.every(item => item.state === t('ov.lim.notRecorded'))).toBe(true);
    // Another backend gets no honk keys: its missing recorders are simply not provided.
    const elsewhere = limits(off, other);
    expect(group(elsewhere, 'recordOff')).toBeUndefined();
    expect(group(elsewhere, 'notProvided')).toEqual({cause: 'notProvided', reason: t('ov.lim.notProvidedOther'), items: expect.any(Array)});
  });

  it('points flows that are idle at the runtime switch unless record_flows is false', () => {
    const idle = group(limits(patched({flows: {recording: 'off'}})), 'flowsIdle');
    expect(idle).toEqual({
      cause: 'flowsIdle',
      reason: t('ov.lim.flowsIdle'),
      link: {href: '#/settings?card=runtime', text: t('settings.runtime')},
      items: [{id: 'flows', label: t('rule.flows'), state: t('ov.lim.notRecordingNow')}]
    });
    expect(group(limits(patched({flows: {recording: 'off'}}), other), 'flowsIdle')?.reason).toBe(t('ov.lim.flowsSwitch'));
    // honk offers flows.max_flows only while record_flows allows recording, so its absence means the key is false.
    const disallowed = limits(patched({flows: {recording: 'off'}, runtime_settings: {fields: ['record_flows', 'log.level']}}));
    expect(group(disallowed, 'flowsIdle')).toBeUndefined();
    expect(group(disallowed, 'recordOff')?.keys).toEqual(['record_flows: true']);
    expect(limits(patched({flows: {recording: 'sampled'}}))).toEqual([]);
  });

  it('explains a configuration that is not loaded once for everything that needs it', () => {
    const groups = limits(patched({config: {available: false, writable: false}, nodes: {can_manage: false}, geodata: {can_update: false}}));
    expect(groups.map(g => g.cause)).toEqual(['configNotLoaded']);
    expect(groups[0]).toMatchObject({reason: t('ov.lim.configMissing')});
    expect(groups[0].items.map(item => [item.id, item.state])).toEqual([
      ['config', t('ov.lim.notLoaded')],
      ['manage', t('ov.lim.noEdit')],
      ['geodata', t('ov.lim.noUpdate')]
    ]);
    expect(limits(patched({config: {available: false}}), other)[0].reason).toBe(t('ov.lim.configMissingOther'));
  });

  it('gives a read-only configuration the write key, the restart and the docs, and only the state elsewhere', () => {
    const readOnly = patched({config: {writable: false}, providers: {can_manage: false}});
    const [configGroup] = limits(readOnly);
    expect(configGroup).toMatchObject({
      cause: 'configReadOnly',
      reason: t('ov.lim.configWrite'),
      keys: ['config_write: true'],
      restart: true,
      link: {href: docsHref('en', 'read-only'), text: t('ov.lim.docsReadOnly'), external: true}
    });
    expect(ids(configGroup)).toEqual(['config', 'manage']);
    expect(limits(patched({config: {writable: undefined}}))[0].items[0].state).toBe(t('config.readOnly'));
    expect(limits(readOnly, other)[0]).toEqual({cause: 'configReadOnly', reason: t('ov.lim.configWriteOther'), items: configGroup.items});
    expect(backendLimits(readOnly, undefined, t, 'en')[0].keys).toBeUndefined();
  });

  it('blames the main file when writes work but nodes cannot be edited', () => {
    const [main] = limits(patched({nodes: {can_manage: false}}));
    expect(main).toMatchObject({cause: 'mainReadOnly', reason: t('ov.lim.mainReadOnly'), link: {href: docsHref('en', 'read-only')}});
    expect(main.items).toEqual([{id: 'manage', label: t('ov.lim.manage'), state: t('ov.lim.noEdit')}]);
    expect(limits(patched({nodes: {can_manage: false}}), other)[0]).toEqual({
      cause: 'mainReadOnly',
      reason: t('ov.lim.mainReadOnlyOther'),
      link: undefined,
      items: main.items
    });
  });

  it('lists the geodata causes the capabilities cannot rule out', () => {
    const stuck = {available: true, can_update: false} as const;
    expect(group(limits(patched({geodata: {...stuck, assets: []}})), 'geodataUpdate')?.reason).toBe(t('ov.lim.geoNoAssets'));
    const noDb = group(limits(patched({geodata: {...stuck, configurable_sources: undefined}})), 'geodataUpdate');
    expect(noDb).toMatchObject({reason: t('ov.lim.geoNoStateDb'), restart: true, link: {href: docsHref('en', 'state-db')}});
    expect(noDb?.keys?.map(key => key.split(':')[0])).toEqual(['geosite_download_url', 'geoip_download_url']);
    expect(group(limits(patched({geodata: {...stuck, configurable_sources: true}})), 'geodataUpdate')).toMatchObject({
      reason: t('ov.lim.geoNoUrl'),
      link: {href: '#/settings?card=geodata', text: t('settings.geodata')}
    });
    expect(group(limits(patched({geodata: {...stuck, configurable_sources: undefined}}), other), 'geodataUpdate')).toEqual({
      cause: 'geodataUpdate',
      reason: t('ov.lim.geoOther'),
      items: [{id: 'geodata', label: t('settings.geodata'), state: t('ov.lim.noUpdate')}]
    });
    expect(ids(group(limits(patched({geodata: {available: false}})), 'geodataUnreadable'))).toEqual(['geodata']);
    expect(ids(group(limits(patched({geodata: {available: false}}), other), 'notProvided'))).toEqual(['geodata']);
  });

  it('groups services that are not running', () => {
    const notRunning = group(limits(patched({providers: {can_refresh: false}, probes: {available: false}})), 'notRunning');
    expect(notRunning?.reason).toBe(t('ov.lim.notRunningReason'));
    expect(notRunning?.items).toEqual([
      {id: 'probes', label: t('ov.r.probes'), state: t('ov.lim.notRunning')},
      {id: 'subscriptions', label: t('ov.lim.subscriptions'), state: t('ov.lim.noRefresh')}
    ]);
    expect(group(limits(patched({providers: {can_refresh: false}}), other), 'notRunning')?.reason).toBe(t('ov.lim.notRunningOther'));
  });

  it('sends honk features the build lacks to the version requirement and ignores suspend and resume', () => {
    const groups = limits(patched({events: {available: false}, suspend: {available: false}, resume: {available: false}}));
    expect(groups).toEqual([
      {
        cause: 'notProvided',
        reason: t('ov.lim.notProvided'),
        link: {href: docsHref('en', 'honk-version'), text: t('ov.lim.docsVersion'), external: true},
        items: [{id: 'events', label: t('nav.events'), state: t('ov.notAvailable')}]
      }
    ]);
  });

  it('orders the groups by cause and puts each feature in one group', () => {
    const groups = limits(capabilitiesBase);
    expect(groups.map(g => g.cause)).toEqual(['configNotLoaded', 'recordOff', 'geodataUnreadable', 'notRunning', 'notProvided']);
    const every = groups.flatMap(g => g.items.map(item => item.id));
    expect(new Set(every).size).toBe(every.length);
  });
});

describe('limitSnippet', () => {
  it('nests the keys in the native_api section', () => {
    expect(limitSnippet(['record_logs: true', 'record_dns_log: true'])).toBe(
      'experimental {\n  native_api {\n    record_logs: true\n    record_dns_log: true\n  }\n}'
    );
  });
});
