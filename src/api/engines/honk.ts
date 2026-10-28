import {honkGlobal} from './honkSettings';
import {blockFields, scanConfig} from '../../dae/text';
import {configManagement} from './honkConfig';
import type {Capabilities, RuntimeSettings} from '../model';
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
// honk reads its API settings from `experimental { native_api { } }`, and only at startup.
const nativeApi = (key: string) => `experimental.native_api.${key}`;
const recorderOff = (key: string): EngineReason => ({code: 'recorder-off', settings: [{key: nativeApi(key), value: 'true'}]});
const lacks: EngineReason = {code: 'build-lacks'};
// honk native_api: the database store takes its first import only with the API on, writes on and a credential.
const storeFlag: EngineReason = {
  code: 'start-flag',
  flag: '--store db',
  settings: [
    {key: nativeApi('enabled'), value: 'true'},
    {key: nativeApi('config_write'), value: 'true'}
  ],
  credentials: ['password_auth: true', 'secret']
};
// honk config.rs running: the loaded sources and the engine's command channel.
const unlessRunning = (resources: Capabilities['resources']): EngineReason => ({code: resources.config.available ? 'starting-or-stopping' : 'config-unloaded'});

// The download URLs of the docs' example configuration (docs/en/configuration.md).
const geositeUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat';
const geoipUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat';

function reason(subject: EngineSubject, capabilities: Capabilities, recording?: RuntimeSettings['recording']): EngineReason | undefined {
  const resources = capabilities.resources;
  // A resource an older build leaves out is off because that build does not have it, which is all honk can say.
  if (capabilities.unreported?.includes(subject as keyof Capabilities['resources'])) return lacks;
  if ((subject === 'flows' || subject === 'logs' || subject === 'dns_log') && recording?.[subject]?.allowed === false) {
    return recorderOff(recorders[subject]!);
  }
  switch (subject) {
    // honk config.rs: the sources load once honk has started and stay within 32 files and 8 MiB; writes follow
    // config_write. A build that does not report the switch may not have it.
    case 'config':
      if (!resources.config.available) return {code: 'config-unloaded'};
      return resources.config.writable === false ? {code: 'writes-off', settings: [{key: nativeApi('config_write'), value: 'true'}]} : undefined;
    // honk config.rs can_manage: with writes on, node edits go to the main file, which may refuse them.
    case 'manage':
      return {code: 'main-file-read-only'};
    // Probes and subscription refreshes run only while honk is up.
    case 'probes':
    case 'subscriptions':
      return {code: 'starting-or-stopping'};
    case 'geodata':
      // honk geodata.rs capability: unavailable only when routing and DNS loaded different files of one kind. Without
      // the state database honk has no built-in URLs and takes the two from the configuration file, under
      // `assets.geodata` (parser/assets.rs; the legacy experimental.native_api keys still parse, but not beside them).
      if (!resources.geodata.available) return {code: 'geodata-mismatch'};
      if (resources.geodata.configurable_sources === true) return undefined;
      return {
        code: 'no-download-urls',
        settings: [
          {key: 'assets.geodata.geosite', value: `'${geositeUrl}'`},
          {key: 'assets.geodata.geoip', value: `'${geoipUrl}'`}
        ]
      };
    case 'flows': {
      if (!resources.flows.available) return lacks;
      // honk settings.rs flow_recording_policy: `auto` records on demand; `off` records nothing, because the mode is
      // Off or record_flows forbids recording. `flows.max_flows` is offered only while record_flows allows it; a build
      // that does not list its fields does not say which.
      if (resources.flows.recording === 'auto') return {code: 'recorded-on-demand'};
      const fields = resources.runtime_settings.available ? resources.runtime_settings.fields : undefined;
      if (recording?.flows?.mode === 'off') return {code: 'mode-off'};
      if (resources.flows.recording !== 'off') return undefined;
      if (fields?.includes('flows.max_flows')) return {code: 'mode-off'};
      return fields ? recorderOff('record_flows') : undefined;
    }
    // Creating sources, the forms, the rule and group editors and activating a revision all write the configuration
    // (honk types.rs: create and config_patch are `editable`; config.rs can_activate).
    case 'create':
    case 'global_settings':
    case 'mode':
    case 'rule_edit':
    case 'group_edit':
    case 'restore':
      return reason('config', capabilities);
    // honk config.rs: export needs the loaded sources; import and revisions need the database store, which honk opens
    // with `--store db` and which alone reports revisions; import also writes.
    case 'export':
      return {code: 'config-unloaded'};
    case 'import':
    case 'revisions':
      if (!resources.config.available) return {code: 'config-unloaded'};
      if (!configManagement(capabilities).revisions) return storeFlag;
      return subject === 'import' ? reason('config', capabilities) : undefined;
    // honk geodata.rs: download URLs and the schedule are settings only while the state database is open.
    case 'geodata_settings':
      return {code: 'state-db-closed', writeSwitch: nativeApi('config_write')};
    // honk types.rs: validation and reload follow `running`; suspend and resume are always off, and a trace resolves
    // no domain live (routing.rs). No setting turns those on.
    case 'config_validate':
    case 'reload':
      return unlessRunning(resources);
    case 'suspend':
    case 'resume':
    case 'trace_live':
      return {code: 'no-switch'};
    // honk always offers these, so it has no reason to give.
    case 'validate_full':
    case 'selection':
    case 'dns_cache_read':
    case 'dns_cache_delete':
    case 'dns_cache_flush':
      return undefined;
    default: {
      const recorder = recorders[subject];
      return recorder ? recorderOff(recorder) : lacks;
    }
  }
}

// honk parser/sources.rs contains_api_secret: a source is refused when a native_api or clash_api block of a top-level
// `experimental` section holds a `secret` or any nested block, which honk will not write back.
const listenerBlocks = new Set(['native_api', 'clash_api']);
function holdsListenerSecret(text: string): boolean {
  const {blocks, tokens} = scanConfig(text);
  return blocks.some(
    block =>
      block.name === 'experimental' &&
      block.children.some(
        child => listenerBlocks.has(child.name) && (child.children.length > 0 || blockFields(text, child, tokens).some(field => field.name === 'secret'))
      )
  );
}
// Writes dotted setting names as nested sections; consecutive settings in one section share it.
function nest(settings: Array<{path: string[]; value: string}>, indent: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < settings.length;) {
    const [head, ...rest] = settings[i].path;
    if (!rest.length) {
      lines.push(`${indent}${head}: ${settings[i++].value}`);
      continue;
    }
    const inner: typeof settings = [];
    for (; i < settings.length && settings[i].path.length > 1 && settings[i].path[0] === head; i++)
      inner.push({...settings[i], path: settings[i].path.slice(1)});
    lines.push(`${indent}${head} {`, ...nest(inner, `${indent}  `), `${indent}}`);
  }
  return lines;
}

export const honk: Engine = {
  id: 'honk',
  nodeLinkSchemes: ['vless', 'vmess', 'trojan', 'trojan-go', 'ss', 'ssr', 'socks5', 'http', 'https', 'hysteria2', 'hy2', 'tuic', 'juicity', 'anytls'],
  flowDemandGraceSeconds: 60,
  globalSettings: honkGlobal,
  reason,
  // Reading these back takes a BPF_PROG_QUERY per hook, or a switch into the daens namespace for dae0peer.
  uncheckedHooks: ['cgroup', 'sk_lookup', 'dae0peer'],
  holdsCredentials: source => holdsListenerSecret(source.content),
  snippet: (settings: EngineSetting[]) =>
    nest(
      settings.map(({key, value}) => ({path: key.split('.'), value})),
      ''
    ).join('\n'),
  // honk redacts the native API token when it returns a source, so `experimental { native_api { } }` is not the file's text.
  redactedSections: blocks =>
    blocks
      .filter(block => block.name === 'experimental' && block.children.some(child => child.name === 'native_api'))
      .map(block => ({block, name: 'experimental.native_api'})),
  daeText: true
};
