import {scanConfig, type TextBlock} from '../../dae/text';
import type {Capabilities} from '../model';
import type {Engine, EngineReason, EngineSetting, EngineSubject} from './types';

// honk's recorders, each available unless its record_* setting is false; every one defaults to true
// (honk experimental.rs NativeApiConfig::default).
const recorders: Partial<Record<EngineSubject, string>> = {
  traffic_history: 'record_traffic',
  memory_history: 'record_memory',
  logs: 'record_logs',
  dns_log: 'record_dns_log',
  flows: 'record_flows'
};
const recorderOff = (key: string): EngineReason => ({code: 'recorder-off', settings: [{key, value: 'true'}]});
const lacks: EngineReason = {code: 'build-lacks'};

// The download URLs of the docs' example configuration (docs/en/configuration.md).
const geositeUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat';
const geoipUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat';

function reason(subject: EngineSubject, capabilities: Capabilities): EngineReason | undefined {
  const resources = capabilities.resources;
  // A resource an older build leaves out is off because that build does not have it, which is all honk can say.
  if (capabilities.unreported?.includes(subject as keyof Capabilities['resources'])) return lacks;
  switch (subject) {
    // honk config.rs: the sources load once honk has started and stay within 32 files and 8 MiB; writes follow
    // config_write. A build that does not report the switch may not have it.
    case 'config':
      if (!resources.config.available) return {code: 'config-unloaded'};
      return resources.config.writable === false ? {code: 'writes-off', settings: [{key: 'config_write', value: 'true'}]} : undefined;
    // honk config.rs can_manage: with writes on, node edits go to the main file, which may refuse them.
    case 'manage':
      return {code: 'main-file-read-only'};
    // Probes and subscription refreshes run only while honk is up.
    case 'probes':
    case 'subscriptions':
      return {code: 'starting-or-stopping'};
    case 'geodata':
      // honk geodata.rs capability: unavailable only when routing and DNS loaded different files of one kind. Without
      // the state database honk has no built-in URLs and takes the two from the configuration file.
      if (!resources.geodata.available) return {code: 'geodata-mismatch'};
      if (resources.geodata.configurable_sources === true) return undefined;
      return {
        code: 'no-download-urls',
        settings: [
          {key: 'geosite_download_url', value: `'${geositeUrl}'`},
          {key: 'geoip_download_url', value: `'${geoipUrl}'`}
        ]
      };
    case 'flows': {
      if (!resources.flows.available) return lacks;
      // honk settings.rs capability: `flows.max_flows` is offered only while record_flows allows recording, so flows
      // that are off are recorded on demand unless it is missing. A build that does not list its fields does not say.
      const settings = resources.runtime_settings;
      const allowed = !settings.available || !settings.fields || settings.fields.includes('flows.max_flows');
      return allowed ? {code: 'recorded-on-demand'} : recorderOff('record_flows');
    }
    default: {
      const recorder = recorders[subject];
      return recorder ? recorderOff(recorder) : lacks;
    }
  }
}

// honk refuses to write a source that defines a native_api or clash_api listener, whose secret it will not write back.
const listenerBlocks = new Set(['native_api', 'clash_api']);
const definesListener = (blocks: TextBlock[]): boolean => blocks.some(block => listenerBlocks.has(block.name) || definesListener(block.children));

export const honk: Engine = {
  id: 'honk',
  reason,
  holdsCredentials: source => source.content !== undefined && definesListener(scanConfig(source.content).blocks),
  // honk reads its API settings from `experimental { native_api { } }`, and only at startup.
  snippet: (settings: EngineSetting[]) =>
    ['experimental {', '  native_api {', ...settings.map(({key, value}) => `    ${key}: ${value}`), '  }', '}'].join('\n'),
  settingName: key => `experimental.native_api.${key}`,
  // honk redacts the native API token when it returns a source, so `experimental { native_api { } }` is not the file's text.
  redactedSections: blocks =>
    blocks
      .filter(block => block.name === 'experimental' && block.children.some(child => child.name === 'native_api'))
      .map(block => ({block, name: 'experimental.native_api'}))
};
