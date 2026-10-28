import {describe, expect, it} from 'vitest';
import type {Capabilities, ReportedCapabilities, RuntimeSettings, Version} from '../../api/model';
import {capabilities as demoCapabilities, capabilitiesBase, capabilitiesM1, version} from '../../../mock/fixtures';
import {translate, type Key, type Translator} from '../../i18n';
import {backendLimits, type LimitCause, type LimitGroup} from './limits';
import {limitHint} from './limitHint';
import {docsHref, type DocsAnchor} from './docs';
import {limitCount} from './limitCauses';
const t: Translator = (key, params) => translate('en', key, params);
const other = {...version, engine: {...version.engine, name: 'other'}};
const capabilities = structuredClone(demoCapabilities);
capabilities.resources.flows.recording = 'on';
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

const why = (text: Key, links: object[] = []) => ({label: t('ov.lim.why'), text: t(text), links});
// A feature's requirements section, linked from its group's help.
const req = (anchor: DocsAnchor, feature: Key) => ({href: docsHref('en', anchor), text: t('ov.lim.docsFor', {feature: t(feature)}), external: true});
const readOnlyDocs = {href: docsHref('en', 'read-only'), text: t('ov.lim.docsReadOnly'), external: true};
// honk's settings sit in its native_api section.
const nativeApi = (lines: string[]) => ['experimental {', '  native_api {', ...lines.map(line => '    ' + line), '  }', '}'].join('\n');
const howTo = (text: Key, lines: string[], links: object[] = []) => ({label: t('ov.lim.howTo'), text: t(text), snippet: nativeApi(lines), links});
// honk's configuration extension: the file store reports no revisions and refuses imports.
const withStore = (caps: Capabilities, db: boolean, canActivate = db): Capabilities => ({
  ...caps,
  extensions: {
    'x-honk': {config_export: {available: true}, config_import: {available: false}, config_revisions: {available: db, can_activate: canActivate}}
  }
});

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
      // Traffic and memory history share one section.
      help: howTo(
        'ov.lim.recordOff',
        ['record_dns_log: true', 'record_traffic: true', 'record_memory: true', 'record_logs: true'],
        [req('req-dns-log', 'ov.r.dnsLog'), req('req-traffic-history', 'ov.r.trafficHistory'), req('req-logs', 'nav.logs')]
      )
    });
    expect(ids(recordOff)).toEqual(['dns_log', 'traffic_history', 'memory_history', 'logs']);
    expect(group(limits(patched({logs: {available: false}})), 'recordOff')?.headline).toBe('The configuration turns off 1 recorder');
    // Another backend gets no honk keys: its missing recorders are simply not provided.
    const elsewhere = limits(off, other);
    expect(group(elsewhere, 'recordOff')).toBeUndefined();
    expect(group(elsewhere, 'notProvided')).toMatchObject({headline: 'The backend does not provide 4 features', link: undefined});
  });

  it('tells flows recorded on demand from the Off mode, both pointed at the runtime switch', () => {
    const idle = group(limits(patched({flows: {recording: 'auto'}})), 'flowsIdle');
    expect(idle).toEqual({
      cause: 'flowsIdle',
      headline: t('ov.lim.h.flowsIdle'),
      link: {href: '#/settings?card=runtime', text: t('settings.runtime')},
      items: [{id: 'flows', label: t('flow.records')}]
    });
    // The Off mode never records, so it is not described as recording on demand.
    expect(group(limits(patched({flows: {recording: 'off'}})), 'flowsIdle')).toEqual({...idle, headline: t('ov.lim.h.flowsModeOff')});
    const offMode = {flows: {allowed: true, active: false, mode: 'off' as const}};
    expect(group(backendLimits(patched({flows: {recording: 'off'}}), version, t, 'en', offMode), 'flowsIdle')?.headline).toBe(t('ov.lim.h.flowsModeOff'));
    expect(group(limits(patched({flows: {recording: 'off'}}), other), 'flowsIdle')?.headline).toBe(t('ov.lim.h.flowsOff'));
    // honk offers flows.max_flows only while record_flows allows recording, so its absence means the key is false.
    const disallowed = limits(patched({flows: {recording: 'off'}, runtime_settings: {fields: ['record_flows', 'log.level']}}));
    expect(group(disallowed, 'flowsIdle')).toBeUndefined();
    expect(group(disallowed, 'recordOff')?.help?.snippet).toBe(nativeApi(['record_flows: true']));
    expect(limits(patched({flows: {recording: 'sampled'}}))).toEqual([]);
  });

  it('files flows that are off without a runtime switch as idle, with no Settings link', () => {
    const off = (runtime_settings: Partial<Resources['runtime_settings']>) =>
      group(limits(patched({flows: {recording: 'off'}, runtime_settings})), 'flowsIdle');
    const items = [{id: 'flows', label: t('flow.records')}];
    // Without a field list honk does not say whether the mode or the configuration turned recording off.
    expect(off({available: false})).toEqual({cause: 'flowsIdle', headline: t('ov.lim.h.flowsOff'), items});
    expect(off({fields: ['flows.max_flows', 'log.level']})).toEqual({cause: 'flowsIdle', headline: t('ov.lim.h.flowsModeOff'), items});
  });

  it('lists the rule list, validation and closing connections when the backend turns them off', () => {
    const base = limits(capabilitiesBase, other);
    expect(ids(group(base, 'configNotLoaded'))).toEqual(['config', 'config_validate', 'manage', 'group_edit']);
    expect(ids(group(base, 'notProvided'))).toContain('rules');
    const m1 = limits(capabilitiesM1, other);
    expect(ids(group(m1, 'configNotLoaded'))).toEqual(['config', 'config_validate']);
    expect(ids(group(m1, 'notProvided'))).toEqual(expect.arrayContaining(['rules', 'close']));
    expect(group(m1, 'notProvided')?.items.find(item => item.id === 'close')?.label).toBe(t('ov.lim.close'));
    // Validation follows honk's `running` (config.rs): with the sources loaded, it waits for the engine, under its own headline.
    const validating = limits(patched({config: {writable: false}, config_validate: {available: false}}));
    expect(group(validating, 'notRunning')).toMatchObject({headline: t('ov.lim.h.configValidate'), features: undefined});
    expect(ids(group(validating, 'notRunning'))).toEqual(['config_validate']);
    expect(group(validating, 'notProvided')).toBeUndefined();
  });

  it('counts in the headline only what the build lacks', () => {
    const mixed = group(limits(patched({config_validate: {modes: ['syntax']}, events: {available: false}})), 'notProvided');
    expect(ids(mixed)).toEqual(['validate_full', 'events']);
    expect(mixed).toMatchObject({headline: 'This honk build lacks 1 feature', features: 'Full validation, Events'});
  });

  it('explains a configuration that is not loaded once for everything that needs it', () => {
    const groups = limits(patched({config: {available: false, writable: false}, nodes: {can_manage: false}, geodata: {can_update: false}}));
    expect(groups.map(g => g.cause)).toEqual(['configNotLoaded']);
    expect(groups[0]).toMatchObject({
      headline: t('ov.lim.h.configNotLoaded'),
      help: why('ov.lim.configMissing', [
        req('req-config-edit', 'nav.config'),
        req('req-nodes', 'ov.lim.manage'),
        req('req-rules', 'ov.lim.ruleEdit'),
        req('req-geodata-update', 'settings.geodata')
      ])
    });
    expect(ids(groups[0])).toEqual(['config', 'manage', 'global_settings', 'mode', 'rule_edit', 'geodata']);
    // The headline names the configuration, so a group of only that has no features line; another backend has no help.
    expect(limits(patched({config: {available: false}}), other)).toEqual([
      {
        cause: 'configNotLoaded',
        headline: t('ov.lim.h.configNotLoaded'),
        features: 'Configuration, Editing rules',
        items: [
          {id: 'config', label: t('nav.config')},
          {id: 'rule_edit', label: t('ov.lim.ruleEdit')}
        ]
      }
    ]);
    // With only the configuration off, the headline names everything and there is no features line.
    expect(limits(patched({config: {available: false}, rules: {available: false}}), other)[0]).toEqual({
      cause: 'configNotLoaded',
      headline: t('ov.lim.h.configNotLoaded'),
      items: [{id: 'config', label: t('nav.config')}]
    });
  });

  it('gives a read-only configuration the write key and the docs, and only the headline elsewhere', () => {
    const readOnly = patched({config: {writable: false}, providers: {can_manage: false}});
    const [configGroup] = limits(readOnly);
    expect(configGroup).toMatchObject({
      cause: 'configReadOnly',
      headline: t('ov.lim.h.configReadOnly'),
      help: howTo(
        'ov.lim.configWrite',
        ['config_write: true'],
        [readOnlyDocs, req('req-config-edit', 'nav.config'), req('req-nodes', 'ov.lim.manage'), req('req-rules', 'ov.lim.ruleEdit')]
      )
    });
    expect(ids(configGroup)).toEqual(['config', 'manage', 'global_settings', 'mode', 'rule_edit']);
    expect(ids(limits(patched({config: {writable: undefined}}))[0])).toEqual(['config', 'global_settings', 'mode', 'rule_edit']);
    expect(limits(readOnly, other)[0].help).toBeUndefined();
    expect(backendLimits(readOnly, undefined, t, 'en')[0].help).toBeUndefined();
  });

  it('blames the main file when writes work but nodes cannot be edited', () => {
    const [main] = limits(patched({nodes: {can_manage: false}}));
    expect(main).toEqual({
      cause: 'mainReadOnly',
      headline: t('ov.lim.h.mainReadOnly'),
      help: why('ov.lim.mainReadOnly', [readOnlyDocs, req('req-nodes', 'ov.lim.manage')]),
      items: [{id: 'manage', label: t('ov.lim.manage')}]
    });
    // Another engine gives no reason, and can_manage false can also mean the endpoints are not implemented, so no cause is named.
    expect(limits(patched({nodes: {can_manage: false}}), other)[0].help).toBeUndefined();
  });

  it('lists the geodata causes the capabilities cannot rule out', () => {
    const stuck = {available: true, can_update: false} as const;
    const geodata = (patch: Partial<Resources['geodata']>, backend?: Version) =>
      group(limits(patched({geodata: {...stuck, ...patch}}), backend), 'geodataUpdate');
    expect(geodata({assets: []})).toMatchObject({
      headline: t('ov.lim.h.geodataUpdate'),
      help: why('ov.lim.geoNoAssets', [req('req-geodata-update', 'settings.geodata')])
    });
    const noDb = geodata({configurable_sources: undefined});
    expect(noDb?.help).toMatchObject({
      label: t('ov.lim.howTo'),
      text: t('ov.lim.geoNoStateDb'),
      links: [{href: docsHref('en', 'state-db')}, req('req-geodata-update', 'settings.geodata')]
    });
    expect(noDb?.help?.snippet?.split('\n').map(line => line.trim().split(':')[0])).toEqual(['assets {', 'geodata {', 'geosite', 'geoip', '}', '}']);
    expect(geodata({configurable_sources: true})?.help).toEqual(
      why('ov.lim.geoNoUrl', [{href: '#/settings?card=geodata', text: t('settings.geodata')}, req('req-geodata-update', 'settings.geodata')])
    );
    expect(geodata({configurable_sources: undefined}, other)).toEqual({
      cause: 'geodataUpdate',
      headline: t('ov.lim.h.geodataUpdate'),
      items: [{id: 'geodata', label: t('settings.geodata')}]
    });
    const unreadable = group(limits(patched({geodata: {available: false}})), 'geodataUnreadable');
    expect(unreadable).toMatchObject({
      headline: t('ov.lim.h.geodataUnreadable'),
      features: undefined,
      help: why('ov.lim.geoUnreadable', [req('req-geodata', 'settings.geodata')])
    });
    expect(ids(group(limits(patched({geodata: {available: false}}), other), 'notProvided'))).toEqual(['geodata']);
  });

  it('names one service that is not running in the headline and counts two', () => {
    const both = group(limits(patched({providers: {can_refresh: false}, probes: {available: false}})), 'notRunning');
    expect(both).toMatchObject({
      headline: '2 services are unavailable for now',
      features: 'Latency probes, Subscriptions',
      help: why('ov.lim.notRunningReason', [req('req-probes', 'ov.r.probes'), req('req-subscription-refresh', 'ov.lim.subscriptions')])
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
        config: {available: true, create: false},
        flows: {...kept.flows, recording: 'off'},
        runtime_settings: {available: true}
      } as unknown as ReportedCapabilities['resources']
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

it('explains forbidden runtime recorders even when their resources remain available', () => {
  const recording: RuntimeSettings['recording'] = {
    flows: {allowed: false, active: false, mode: 'off'},
    logs: {allowed: false, active: false, mode: 'off'},
    dns_log: {allowed: false, active: false, mode: 'off'}
  };
  const result = backendLimits(capabilities, version, t, 'en', recording);
  expect(ids(group(result, 'recordOff'))).toEqual(['flows', 'dns_log', 'logs']);
  expect(group(result, 'recordOff')?.help?.snippet).toBe(nativeApi(['record_flows: true', 'record_dns_log: true', 'record_logs: true']));
});

describe('the features each cause turns off', () => {
  const readOnly = patched({config: {writable: false, create: false}, groups: {config_patch: false}});

  it('lists every write a read-only configuration turns off under its cause, and none while writes work', () => {
    const [configGroup] = limits(withStore(readOnly, true, false));
    expect(ids(configGroup)).toEqual(['config', 'create', 'global_settings', 'mode', 'rule_edit', 'group_edit', 'import', 'restore']);
    expect(configGroup.help?.links).toEqual([
      readOnlyDocs,
      req('req-config-edit', 'nav.config'),
      req('req-rules', 'ov.lim.ruleEdit'),
      req('req-group-edit', 'ov.lim.groupEdit'),
      req('req-revisions', 'ov.lim.import')
    ]);
    // Another engine has no forms of its own, and the extension actions are listed only where the engine explains them.
    expect(ids(limits(withStore(readOnly, true, false), other)[0])).toEqual(['config', 'create', 'rule_edit', 'group_edit']);
    expect(limits(withStore(capabilities, true))).toEqual([]);
  });

  it('puts import and revisions behind the start-up flag on a file store, and not on another engine', () => {
    const file = withStore(capabilities, false);
    const startFlag = group(limits(file), 'startFlag');
    expect(startFlag).toMatchObject({
      headline: '2 features need a start-up option',
      features: 'Import, Revision history',
      help: {
        ...howTo('ov.lim.startFlag', ['enabled: true', 'config_write: true'], [req('req-revisions', 'ov.lim.import')]),
        text: t('ov.lim.startFlag', {flag: '--store db', credential: 'password_auth: true or secret'})
      }
    });
    // The keys come from the engine, not the text.
    expect(startFlag?.help?.text).toBe(
      'Restart honk with --store db. Before the first database import, add the settings below to the configuration, plus either password_auth: true or secret.'
    );
    expect(ids(startFlag)).toEqual(['import', 'revisions']);
    expect(limits(file, other)).toEqual([]);
    // A build that does not report the extension says nothing of export, import or revisions.
    expect(limits({...capabilities, extensions: {}})).toEqual([]);
    expect(limits({...capabilities, extensions: {'x-honk': {config_import: {available: false}}}}).flatMap(g => g.items.map(item => item.id))).toEqual([
      'import'
    ]);
    // Without loaded sources every configuration action shares that cause instead.
    const unloaded = limits(withStore(patched({config: {available: false}}), false));
    expect(group(unloaded, 'startFlag')).toBeUndefined();
    expect(ids(group(unloaded, 'configNotLoaded'))).toEqual(expect.arrayContaining(['import', 'revisions']));
  });

  it('lists the actions only the contract reports, and leaves out what no honk setting turns on', () => {
    const off = patched({
      config_validate: {modes: ['syntax']},
      groups: {selection: false},
      routing_trace: {resolve_modes: ['none']},
      dns_cache: {read: false, delete_entry: false, flush: false},
      reload: {available: false},
      suspend: {available: false},
      resume: {available: false}
    });
    const elsewhere = group(limits(off, other), 'notProvided');
    expect(ids(elsewhere)).toEqual([
      'validate_full',
      'selection',
      'trace_live',
      'dns_cache_read',
      'dns_cache_delete',
      'dns_cache_flush',
      'reload',
      'suspend',
      'resume'
    ]);
    expect(elsewhere).toMatchObject({headline: 'The backend does not provide 9 features', link: undefined, help: undefined});
    const groups = limits(off);
    expect(ids(group(groups, 'notProvided'))).toEqual(['validate_full', 'selection', 'dns_cache_read', 'dns_cache_delete', 'dns_cache_flush']);
    expect(group(groups, 'notRunning')).toMatchObject({
      headline: t('ov.lim.h.reload'),
      features: undefined,
      help: why('ov.lim.notRunningReason', [req('req-reload-suspend', 'ov.r.reload')])
    });
    expect(groups.flatMap(g => g.items.map(item => item.id))).not.toEqual(expect.arrayContaining(['trace_live']));
  });

  it('sends geodata settings to the state database, which needs no write switch', () => {
    const noDb = patched({geodata: {configurable_sources: undefined}});
    expect(group(limits(noDb), 'stateDb')).toEqual({
      cause: 'stateDb',
      headline: t('ov.lim.h.stateDb'),
      help: {
        ...why('ov.lim.stateDbClosed', [
          {href: docsHref('en', 'state-db'), text: t('ov.lim.docsStateDb'), external: true},
          req('req-geodata-settings', 'ov.lim.geodataSettings')
        ]),
        text: t('ov.lim.stateDbClosed', {key: 'experimental.native_api.config_write'})
      },
      items: [{id: 'geodata_settings', label: t('ov.lim.geodataSettings')}]
    });
    expect(group(limits(noDb), 'stateDb')?.help?.text).toContain('does not require experimental.native_api.config_write.');
    expect(ids(group(limits(noDb, other), 'notProvided'))).toEqual(['geodata_settings']);
  });

  it('explains several blockers at once, each feature in one group', () => {
    const groups = limits(withStore(patched({config: {available: false, writable: false}, reload: {available: false}, logs: {available: false}}), false));
    // Reload needs the loaded sources first, so it joins that cause rather than the running engine's.
    expect(groups.map(g => g.cause)).toEqual(['configNotLoaded', 'recordOff']);
    const every = groups.flatMap(g => g.items.map(item => item.id));
    expect(new Set(every).size).toBe(every.length);
    expect(ids(groups[0])).toEqual(['config', 'global_settings', 'mode', 'rule_edit', 'import', 'revisions', 'reload']);
  });
});

describe('limitCount', () => {
  it('counts the items the overview lists, from the same classification', () => {
    const fixtures: [Capabilities, Version][] = [
      [capabilities, version],
      [capabilitiesBase, other],
      [capabilitiesM1, other],
      [withStore(patched({config: {available: false, writable: false}, reload: {available: false}, logs: {available: false}}), false), version],
      [patched({config: {writable: false}, probes: {available: false}}), version]
    ];
    for (const [caps, backend] of fixtures) {
      expect(limitCount(caps, backend)).toBe(limits(caps, backend).reduce((n, g) => n + g.items.length, 0));
    }
    expect(limitCount(fixtures[3][0], version)).toBeGreaterThan(0);
  });
});

describe('limitHint', () => {
  const hint = (id: Parameters<typeof limitHint>[0], caps: Capabilities, backend: Version = version) => limitHint(id, caps, backend, t, 'en');

  it('gives a hidden feature the text of its group here, its setting and its own section', () => {
    const readOnly = patched({config: {writable: false}});
    expect(hint('rule_edit', readOnly)).toEqual({
      text: group(limits(readOnly), 'configReadOnly')?.help?.text,
      setting: 'experimental.native_api.config_write',
      link: req('req-rules', 'ov.lim.ruleEdit')
    });
    const logsOff = patched({logs: {available: false}});
    expect(hint('logs', logsOff)).toMatchObject({text: group(limits(logsOff), 'recordOff')?.help?.text, setting: 'experimental.native_api.record_logs'});
    const file = withStore(capabilities, false);
    expect(hint('import', file)).toEqual({
      text: group(limits(file), 'startFlag')?.help?.text,
      setting: 'experimental.native_api.enabled, experimental.native_api.config_write',
      link: req('req-revisions', 'ov.lim.import')
    });
  });

  it('says nothing for a feature that is on, one honk does not explain, or another engine', () => {
    expect(hint('rule_edit', capabilities)).toBeUndefined();
    expect(hint('selection', patched({groups: {selection: false}}))).toBeUndefined();
    expect(hint('rule_edit', patched({config: {writable: false}}), other)).toBeUndefined();
  });
});
