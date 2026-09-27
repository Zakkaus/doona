import {describe, expect, it} from 'vitest';
import type {Capabilities, Version} from '../../api/model';
import {capabilities, capabilitiesBase, capabilitiesM1, version} from '../../api/mock/fixtures';
import {translate, type Key, type Translator} from '../../i18n';
import {backendLimits, type LimitCause, type LimitGroup} from './limits';
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

const why = (text: Key, link?: object) => ({label: t('ov.lim.why'), text: t(text), link});
// honk's settings sit in its native_api section.
const nativeApi = (lines: string[]) => ['experimental {', '  native_api {', ...lines.map(line => '    ' + line), '  }', '}'].join('\n');
const howTo = (text: Key, lines: string[], link?: object) => ({label: t('ov.lim.howTo'), text: t(text), snippet: nativeApi(lines), link});

describe('backendLimits', () => {
  it('lists nothing when every feature is on', () => {
    expect(limits(capabilities)).toEqual([]);
  });

  it('merges the honk recorders that are off into one row with the count, the list and one snippet', () => {
    const off = patched({traffic_history: {available: false}, memory_history: {available: false}, logs: {available: false}, dns_log: {available: false}});
    const recordOff = group(limits(off), 'recordOff');
    expect(recordOff).toMatchObject({
      headline: 'The configuration turns off 4 recorders',
      features: 'DNS log, Traffic history, Memory history, Logs',
      help: howTo('ov.lim.recordOff', ['record_dns_log: true', 'record_traffic: true', 'record_memory: true', 'record_logs: true'])
    });
    expect(ids(recordOff)).toEqual(['dns_log', 'traffic_history', 'memory_history', 'logs']);
    expect(group(limits(patched({logs: {available: false}})), 'recordOff')?.headline).toBe('The configuration turns off 1 recorder');
    // Another backend gets no honk keys: its missing recorders are simply not provided.
    const elsewhere = limits(off, other);
    expect(group(elsewhere, 'recordOff')).toBeUndefined();
    expect(group(elsewhere, 'notProvided')).toMatchObject({headline: 'The backend does not provide 4 features', link: undefined});
  });

  it('points flows that are idle at the runtime switch unless record_flows is false', () => {
    const idle = group(limits(patched({flows: {recording: 'off'}})), 'flowsIdle');
    expect(idle).toEqual({
      cause: 'flowsIdle',
      headline: t('ov.lim.h.flowsIdle'),
      link: {href: '#/settings?card=runtime', text: t('settings.runtime')},
      items: [{id: 'flows', label: t('rule.flows')}]
    });
    expect(group(limits(patched({flows: {recording: 'off'}}), other), 'flowsIdle')?.headline).toBe(t('ov.lim.h.flowsOff'));
    // honk offers flows.max_flows only while record_flows allows recording, so its absence means the key is false.
    const disallowed = limits(patched({flows: {recording: 'off'}, runtime_settings: {fields: ['record_flows', 'log.level']}}));
    expect(group(disallowed, 'flowsIdle')).toBeUndefined();
    expect(group(disallowed, 'recordOff')?.help?.snippet).toBe(nativeApi(['record_flows: true']));
    expect(limits(patched({flows: {recording: 'sampled'}}))).toEqual([]);
  });

  it('files flows that are off without a runtime switch as idle, with no Settings link', () => {
    for (const runtime_settings of [{available: false}, {fields: ['flows.max_flows' as const, 'log.level' as const]}]) {
      expect(group(limits(patched({flows: {recording: 'off'}, runtime_settings})), 'flowsIdle')).toEqual({
        cause: 'flowsIdle',
        headline: t('ov.lim.h.flowsIdle'),
        items: [{id: 'flows', label: t('rule.flows')}]
      });
    }
  });

  it('lists the rule list, validation and closing connections when the backend turns them off', () => {
    const base = limits(capabilitiesBase, other);
    expect(ids(group(base, 'configNotLoaded'))).toEqual(['config', 'config_validate', 'manage']);
    expect(ids(group(base, 'notProvided'))).toContain('rules');
    const m1 = limits(capabilitiesM1, other);
    expect(ids(group(m1, 'configNotLoaded'))).toEqual(['config', 'config_validate']);
    expect(ids(group(m1, 'notProvided'))).toEqual(expect.arrayContaining(['rules', 'close']));
    expect(group(m1, 'notProvided')?.items.find(item => item.id === 'close')?.label).toBe(t('ov.lim.close'));
    // Validation follows the loaded sources in honk (config.rs running), so a read-only configuration keeps it.
    expect(ids(group(limits(patched({config: {writable: false}, config_validate: {available: false}})), 'notProvided'))).toEqual(['config_validate']);
  });

  it('explains a configuration that is not loaded once for everything that needs it', () => {
    const groups = limits(patched({config: {available: false, writable: false}, nodes: {can_manage: false}, geodata: {can_update: false}}));
    expect(groups.map(g => g.cause)).toEqual(['configNotLoaded']);
    expect(groups[0]).toMatchObject({
      headline: t('ov.lim.h.configNotLoaded'),
      features: 'Configuration, Nodes and sources, Geodata',
      help: why('ov.lim.configMissing')
    });
    expect(ids(groups[0])).toEqual(['config', 'manage', 'geodata']);
    // The headline names the configuration, so a group of only that has no features line; another backend has no help.
    expect(limits(patched({config: {available: false}}), other)).toEqual([
      {cause: 'configNotLoaded', headline: t('ov.lim.h.configNotLoaded'), items: [{id: 'config', label: t('nav.config')}]}
    ]);
  });

  it('gives a read-only configuration the write key and the docs, and only the headline elsewhere', () => {
    const readOnly = patched({config: {writable: false}, providers: {can_manage: false}});
    const [configGroup] = limits(readOnly);
    expect(configGroup).toMatchObject({
      cause: 'configReadOnly',
      headline: t('ov.lim.h.configReadOnly'),
      features: 'Configuration, Nodes and sources',
      help: howTo('ov.lim.configWrite', ['config_write: true'], {href: docsHref('en', 'read-only'), text: t('ov.lim.docsReadOnly'), external: true})
    });
    expect(ids(configGroup)).toEqual(['config', 'manage']);
    expect(ids(limits(patched({config: {writable: undefined}}))[0])).toEqual(['config']);
    expect(limits(readOnly, other)[0].help).toBeUndefined();
    expect(backendLimits(readOnly, undefined, t, 'en')[0].help).toBeUndefined();
  });

  it('blames the main file when writes work but nodes cannot be edited', () => {
    const [main] = limits(patched({nodes: {can_manage: false}}));
    expect(main).toEqual({
      cause: 'mainReadOnly',
      headline: t('ov.lim.h.mainReadOnly'),
      help: why('ov.lim.mainReadOnly', {href: docsHref('en', 'read-only'), text: t('ov.lim.docsReadOnly'), external: true}),
      items: [{id: 'manage', label: t('ov.lim.manage')}]
    });
    expect(limits(patched({nodes: {can_manage: false}}), other)[0].help).toEqual(why('ov.lim.mainReadOnlyOther'));
  });

  it('lists the geodata causes the capabilities cannot rule out', () => {
    const stuck = {available: true, can_update: false} as const;
    const geodata = (patch: Partial<Resources['geodata']>, backend?: Version) =>
      group(limits(patched({geodata: {...stuck, ...patch}}), backend), 'geodataUpdate');
    expect(geodata({assets: []})).toMatchObject({headline: t('ov.lim.h.geodataUpdate'), help: why('ov.lim.geoNoAssets')});
    const noDb = geodata({configurable_sources: undefined});
    expect(noDb?.help).toMatchObject({label: t('ov.lim.howTo'), text: t('ov.lim.geoNoStateDb'), link: {href: docsHref('en', 'state-db')}});
    expect(
      noDb?.help?.snippet
        ?.split('\n')
        .slice(2, 4)
        .map(line => line.trim().split(':')[0])
    ).toEqual(['geosite_download_url', 'geoip_download_url']);
    expect(geodata({configurable_sources: true})?.help).toEqual(why('ov.lim.geoNoUrl', {href: '#/settings?card=geodata', text: t('settings.geodata')}));
    expect(geodata({configurable_sources: undefined}, other)).toEqual({
      cause: 'geodataUpdate',
      headline: t('ov.lim.h.geodataUpdate'),
      items: [{id: 'geodata', label: t('settings.geodata')}]
    });
    const unreadable = group(limits(patched({geodata: {available: false}})), 'geodataUnreadable');
    expect(unreadable).toMatchObject({headline: t('ov.lim.h.geodataUnreadable'), features: undefined, help: why('ov.lim.geoUnreadable')});
    expect(ids(group(limits(patched({geodata: {available: false}}), other), 'notProvided'))).toEqual(['geodata']);
  });

  it('names one service that is not running in the headline and counts two', () => {
    const both = group(limits(patched({providers: {can_refresh: false}, probes: {available: false}})), 'notRunning');
    expect(both).toMatchObject({
      headline: '2 services are unavailable for now',
      features: 'Latency probes, Subscriptions',
      help: why('ov.lim.notRunningReason')
    });
    expect(ids(both)).toEqual(['probes', 'subscriptions']);
    expect(group(limits(patched({probes: {available: false}})), 'notRunning')).toMatchObject({headline: t('ov.lim.h.probes'), features: undefined});
    const subscriptions = group(limits(patched({providers: {can_refresh: false}}), other), 'notRunning');
    expect(subscriptions).toMatchObject({headline: t('ov.lim.h.subscriptions'), features: undefined, help: undefined});
  });

  it('sends honk features the build lacks to the version requirement and ignores suspend and resume', () => {
    const groups = limits(patched({events: {available: false}, suspend: {available: false}, resume: {available: false}}));
    expect(groups).toEqual([
      {
        cause: 'notProvided',
        headline: 'This honk build lacks 1 feature',
        features: t('nav.events'),
        link: {href: docsHref('en', 'honk-version'), text: t('ov.lim.docsVersion'), external: true},
        items: [{id: 'events', label: t('nav.events')}]
      }
    ]);
  });

  it('orders the groups by cause, puts each feature in one group and lists them in the language', () => {
    const groups = limits(capabilitiesBase);
    expect(groups.map(g => g.cause)).toEqual(['configNotLoaded', 'recordOff', 'geodataUnreadable', 'notRunning', 'notProvided']);
    const every = groups.flatMap(g => g.items.map(item => item.id));
    expect(new Set(every).size).toBe(every.length);
    const zh: Translator = (key, params) => translate('zh-TW', key, params);
    expect(backendLimits(capabilitiesBase, version, zh, 'zh-TW')[1].features).toBe(
      (['ov.r.dnsLog', 'ov.r.trafficHistory', 'ov.r.memoryHistory', 'nav.logs'] as const).map(key => zh(key)).join('\u3001')
    );
  });
});

describe('backendLimits on an older honk', () => {
  it('gives an older honk that leaves resources or fields out no honk reason for them', async () => {
    const {normalizeCapabilities} = await import('../../api/capabilities');
    const {logs: _logs, probes: _probes, geodata: _geodata, traffic_history: _traffic, ...kept} = capabilities.resources;
    const older = normalizeCapabilities({
      ...capabilities,
      resources: {
        ...kept,
        config: {available: true, content: true, create: false},
        flows: {...kept.flows, recording: 'off'},
        runtime_settings: {available: true}
      } as unknown as Resources
    });
    const groups = limits(older);
    expect(group(groups, 'recordOff')).toBeUndefined();
    expect(group(groups, 'notRunning')).toBeUndefined();
    expect(group(groups, 'geodataUnreadable')).toBeUndefined();
    expect(ids(group(groups, 'notProvided'))).toEqual(['probes', 'traffic_history', 'logs', 'geodata']);
    // Writes are off, but a build that does not report the switch is not told to turn it on.
    expect(group(groups, 'configReadOnly')?.help).toBeUndefined();
    // Without its field list, flows that are off are idle rather than a recorder the configuration turned off.
    expect(ids(group(groups, 'flowsIdle'))).toEqual(['flows']);
    // The same resources reported as off keep honk's reasons.
    const reported = limits(patched({logs: {available: false}, probes: {available: false}, geodata: {available: false}}));
    expect([ids(group(reported, 'recordOff')), ids(group(reported, 'notRunning')), ids(group(reported, 'geodataUnreadable'))]).toEqual([
      ['logs'],
      ['probes'],
      ['geodata']
    ]);
  });
});
