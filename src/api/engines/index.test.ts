import {describe, expect, it} from 'vitest';
import {normalizeCapabilities} from '../capabilities';
import {capabilities, version} from '../../../mock/fixtures';
import type {Capabilities, ReportedCapabilities} from '../model';
import {scanConfig} from '../../dae/text';
import {engineOf, type EngineSubject} from '.';

type Resources = Capabilities['resources'];
const patched = (patch: {[K in keyof Resources]?: Partial<Resources[K]>}): Capabilities => ({
  ...capabilities,
  resources: Object.fromEntries(
    Object.entries(capabilities.resources).map(([id, resource]) => [id, {...resource, ...patch[id as keyof Resources]}])
  ) as Resources
});
const honk = engineOf(version);
const other = engineOf({...version, engine: {...version.engine, name: 'other'}});
const listener = "experimental {\n  native_api { listen: '127.0.0.1:9090'\n    secret: '<redacted>' }\n}";

describe('engineOf', () => {
  it('knows honk by its engine name and nothing else', () => {
    expect(honk.id).toBe('honk');
    expect(honk.flowDemandGraceSeconds).toBe(60);
    expect(other.flowDemandGraceSeconds).toBeNull();
    expect(other.id).toBe('unknown');
    expect(engineOf(undefined).id).toBe('unknown');
  });
});

describe('honk', () => {
  it('names the recorder setting for each recorder that is off', () => {
    const off = patched({traffic_history: {available: false}, memory_history: {available: false}, logs: {available: false}, dns_log: {available: false}});
    const reasons = (['traffic_history', 'memory_history', 'logs', 'dns_log'] as const).map(id => honk.reason(id, off));
    expect(reasons).toEqual(
      ['record_traffic', 'record_memory', 'record_logs', 'record_dns_log'].map(key => ({
        code: 'recorder-off',
        settings: [{key: `experimental.native_api.${key}`, value: 'true'}]
      }))
    );
  });

  it('tells flows recorded on demand from the Off mode and from record_flows forbidding them', () => {
    const forbidden = {code: 'recorder-off', settings: [{key: 'experimental.native_api.record_flows', value: 'true'}]};
    expect(honk.reason('flows', patched({flows: {recording: 'auto'}}))).toEqual({code: 'recorded-on-demand'});
    // max_flows is offered while record_flows allows recording, so `off` is the mode.
    expect(honk.reason('flows', patched({flows: {recording: 'off'}}))).toEqual({code: 'mode-off'});
    const allowedOff = {flows: {allowed: true, active: false, mode: 'off' as const}};
    const disallowed = patched({flows: {recording: 'off'}, runtime_settings: {fields: ['record_flows', 'log.level']}});
    expect(honk.reason('flows', disallowed, allowedOff)).toEqual({code: 'mode-off'});
    expect(honk.reason('flows', disallowed)).toEqual(forbidden);
    expect(honk.reason('flows', patched({flows: {recording: 'off'}}), {flows: {allowed: false, active: false, mode: 'auto'}})).toEqual(forbidden);
    expect(honk.reason('flows', patched({flows: {available: false}}))).toEqual({code: 'build-lacks'});
    // A build that does not report the policy is not told it is Off, even when it offers max_flows.
    expect(honk.reason('flows', patched({flows: {recording: undefined}}))).toBeUndefined();
  });

  it('explains the configuration, the main file, services and geodata', () => {
    expect(honk.reason('config', patched({config: {available: false}}))).toEqual({code: 'config-unloaded'});
    expect(honk.reason('config', patched({config: {writable: false}}))).toEqual({
      code: 'writes-off',
      settings: [{key: 'experimental.native_api.config_write', value: 'true'}]
    });
    expect(honk.reason('manage', capabilities)).toEqual({code: 'main-file-read-only'});
    expect(honk.reason('probes', capabilities)).toEqual({code: 'starting-or-stopping'});
    expect(honk.reason('subscriptions', capabilities)).toEqual({code: 'starting-or-stopping'});
    expect(honk.reason('geodata', patched({geodata: {available: false}}))).toEqual({code: 'geodata-mismatch'});
    expect(honk.reason('geodata', patched({geodata: {configurable_sources: true}}))).toBeUndefined();
    const noDb = honk.reason('geodata', patched({geodata: {configurable_sources: undefined}}));
    expect(noDb?.code).toBe('no-download-urls');
    // The standard assets.geodata keys, not the legacy experimental.native_api ones.
    expect(noDb && 'settings' in noDb && noDb.settings.map(setting => setting.key)).toEqual(['assets.geodata.geosite', 'assets.geodata.geoip']);
    expect(noDb && 'settings' in noDb && honk.snippet(noDb.settings)).toMatch(/^assets \{\n {2}geodata \{\n {4}geosite: '.+'\n {4}geoip: '.+'\n {2}\}\n\}$/);
    expect(noDb && 'settings' in noDb && honk.snippet(noDb.settings)).not.toContain('native_api');
    for (const subject of ['events', 'rules', 'config_validate', 'close'] satisfies EngineSubject[])
      expect(honk.reason(subject, capabilities)).toEqual({code: 'build-lacks'});
  });

  it('gives an older build that leaves resources or fields out no reason beyond lacking them', () => {
    const {logs: _logs, probes: _probes, geodata: _geodata, ...kept} = capabilities.resources;
    const older = normalizeCapabilities({
      ...capabilities,
      resources: {
        ...kept,
        config: {available: true, create: false},
        flows: {...kept.flows, recording: 'off'},
        runtime_settings: {available: true}
      } as unknown as ReportedCapabilities['resources']
    });
    for (const subject of ['logs', 'probes', 'geodata'] satisfies EngineSubject[]) expect(honk.reason(subject, older)).toEqual({code: 'build-lacks'});
    // A build that does not report the write switch is not told to turn it on.
    expect(honk.reason('config', older)).toBeUndefined();
    // Without its field list, flows that are off are not put down to the Off mode or to record_flows.
    expect(honk.reason('flows', older)).toBeUndefined();
  });

  it("holds credentials only where an experimental listener holds a secret or a nested block, as honk's parser says", () => {
    expect(honk.holdsCredentials({content: listener})).toBe(true);
    expect(honk.holdsCredentials({content: "experimental { clash_api { tls { cert: '/etc/honk/api.pem' } } }"})).toBe(true);
    expect(honk.holdsCredentials({content: "experimental {\n  native_api { listen: '127.0.0.1:9090' }\n}"})).toBe(false);
    expect(honk.holdsCredentials({content: "clash_api { secret: '<redacted>' }"})).toBe(false);
    expect(honk.holdsCredentials({content: "experimental { native_api { listen: x } }\nglobal { secret: '<redacted>' }"})).toBe(false);
    expect(honk.holdsCredentials({content: '# native_api is off\nglobal { log_level: info }'})).toBe(false);
  });

  it('nests each setting in its section', () => {
    expect(
      honk.snippet([
        {key: 'experimental.native_api.record_logs', value: 'true'},
        {key: 'experimental.native_api.record_dns_log', value: 'true'}
      ])
    ).toBe('experimental {\n  native_api {\n    record_logs: true\n    record_dns_log: true\n  }\n}');
  });
  it('names the native_api section as redacted, and only inside experimental', () => {
    const blocks = scanConfig(`${listener}\nnative_api { listen: '127.0.0.1:9091' }\nexperimental { dns_cache: true }`).blocks;
    expect(honk.redactedSections(blocks).map(({block, name}) => [block.from, name])).toEqual([[0, 'experimental.native_api']]);
  });
});

describe('an unknown engine', () => {
  it('gives no reasons and names no credentials', () => {
    const off = patched({logs: {available: false}, probes: {available: false}, geodata: {available: false}, config: {writable: false}});
    for (const subject of ['logs', 'probes', 'geodata', 'config', 'manage', 'subscriptions', 'close'] satisfies EngineSubject[])
      expect(other.reason(subject, off)).toBeUndefined();
    expect(other.holdsCredentials({content: listener})).toBe(false);
    expect(other.redactedSections(scanConfig(listener).blocks)).toEqual([]);
    expect(other.daeText).toBe(false);
  });
});

it('limits known honk share-link schemes without guessing for other engines', () => {
  expect(honk.nodeLinkSchemes).toContain('vless');
  expect(honk.nodeLinkSchemes).not.toContain('garbage');
  expect(other.nodeLinkSchemes).toBeNull();
});
