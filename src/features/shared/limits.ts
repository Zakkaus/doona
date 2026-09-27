import type {Capabilities, Version} from '../../api/model';
import type {Key, Lang, Translator as LabelFn} from '../../i18n';
import {href} from '../../shell/route';
import {docsHref, type DocsAnchor} from './docs';

export const resourceLabels = {
  connections: 'nav.connections',
  flows: 'rule.flows',
  routing_trace: 'ov.r.routingTrace',
  dns_query: 'ov.r.dnsQuery',
  dns_cache: 'ov.r.dnsCache',
  dns_log: 'ov.r.dnsLog',
  events: 'nav.events',
  probes: 'ov.r.probes',
  traffic_history: 'ov.r.trafficHistory',
  memory_history: 'ov.r.memoryHistory',
  runtime_outbounds: 'ov.r.outbounds',
  logs: 'nav.logs',
  providers: 'nodes.providers',
  config: 'nav.config',
  runtime_settings: 'settings.runtime',
  geodata: 'settings.geodata'
} as const satisfies Record<string, Key>;
type Resource = keyof typeof resourceLabels;

// honk's recorders, each available unless its record_* setting is false; every one defaults to true
// (honk experimental.rs NativeApiConfig::default).
const recorders: Partial<Record<Resource, string>> = {
  traffic_history: 'record_traffic',
  memory_history: 'record_memory',
  logs: 'record_logs',
  dns_log: 'record_dns_log',
  flows: 'record_flows'
};

// Why features are off, in the order the overview lists them.
export const limitCauses = [
  'configNotLoaded',
  'configReadOnly',
  'mainReadOnly',
  'recordOff',
  'geodataUpdate',
  'geodataUnreadable',
  'notRunning',
  'flowsIdle',
  'notProvided'
] as const;
export type LimitCause = (typeof limitCauses)[number];
// `manage` stands for adding and editing nodes and subscriptions, `subscriptions` for refreshing them.
export type LimitId = Resource | 'manage' | 'subscriptions';

export type LimitGroup = {
  cause: LimitCause;
  // Said once for every feature in the group.
  reason: string;
  // honk settings inside `experimental { native_api { } }` that lift the limit; absent on another backend.
  keys?: string[];
  // honk reads native_api only at startup, so changing a key needs a restart.
  restart?: boolean;
  link?: {href: string; text: string; external?: boolean};
  items: {id: LimitId; label: string; state: string}[];
};

// The backend features that are off or limited, grouped by why, so each cause is explained once. A feature appears
// in at most one group, and a resource absent from every group is available.
export function backendLimits(capabilities: Capabilities, version: Pick<Version, 'api'> | undefined, t: LabelFn, lang: Lang): LimitGroup[] {
  const resources = capabilities.resources;
  const honk = version?.api.name === 'dae/honk-native';
  const found = new Map<LimitCause, LimitGroup['items']>();
  const add = (cause: LimitCause, id: LimitId, state: Key, label: Key = resourceLabels[id as Resource]) => {
    const items = found.get(cause) ?? [];
    items.push({id, label: t(label), state: t(state)});
    found.set(cause, items);
  };
  const docs = (anchor: DocsAnchor, text: Key) => (honk ? {href: docsHref(lang, anchor), text: t(text), external: true} : undefined);

  // Writing needs the sources loaded, so a configuration that is not loaded is also not writable (honk config.rs
  // writable, can_manage); node management and geodata updates need writes too and share the configuration's cause.
  const configCause: LimitCause | null = !resources.config.available ? 'configNotLoaded' : resources.config.writable !== true ? 'configReadOnly' : null;
  if (configCause) add(configCause, 'config', configCause === 'configNotLoaded' ? 'ov.lim.notLoaded' : 'config.readOnly');
  if (resources.nodes.can_manage === false || resources.providers.can_manage === false)
    add(configCause ?? 'mainReadOnly', 'manage', 'ov.lim.noEdit', 'ov.lim.manage');

  // honk settings.rs capability: `flows.max_flows` is offered only while record_flows allows recording.
  const flowsAllowed = !resources.runtime_settings.available || (resources.runtime_settings.fields ?? []).includes('flows.max_flows');
  const flowsSwitch = resources.runtime_settings.available && (resources.runtime_settings.fields ?? []).includes('record_flows');
  const recordKeys: string[] = [];
  for (const id of Object.keys(resourceLabels) as Resource[]) {
    const resource = resources[id];
    const recorder = recorders[id];
    if (id === 'config') continue;
    if (id === 'flows' && resource.available && resources.flows.recording === 'off') {
      if (honk && !flowsAllowed) {
        add('recordOff', id, 'ov.lim.notRecorded');
        recordKeys.push(recorder + ': true');
      } else if (flowsSwitch) add('flowsIdle', id, 'ov.lim.notRecordingNow');
      else add('notProvided', id, 'ov.lim.notRecorded');
    } else if (resource.available) {
      if (id === 'geodata' && resources.geodata.can_update !== true) add(configCause ?? 'geodataUpdate', id, 'ov.lim.noUpdate');
      if (id === 'providers' && resources.providers.can_refresh === false) add('notRunning', 'subscriptions', 'ov.lim.noRefresh', 'ov.lim.subscriptions');
    } else if (honk && recorder && id !== 'flows') {
      add('recordOff', id, 'ov.lim.notRecorded');
      recordKeys.push(recorder + ': true');
    } else if (honk && id === 'probes') add('notRunning', id, 'ov.lim.notRunning');
    // honk geodata.rs capability: unavailable only when routing and DNS loaded different files of one kind.
    else if (honk && id === 'geodata') add('geodataUnreadable', id, 'ov.notAvailable');
    else add('notProvided', id, 'ov.notAvailable');
  }

  const geodataReason = (): Pick<LimitGroup, 'reason' | 'keys' | 'restart' | 'link'> => {
    const geodata = resources.geodata;
    if (geodata.assets?.length === 0) return {reason: t('ov.lim.geoNoAssets')};
    // Without the state database honk has no built-in URLs and takes the two from the configuration file.
    if (honk && geodata.configurable_sources !== true)
      return {
        reason: t('ov.lim.geoNoStateDb'),
        keys: [`geosite_download_url: '${geositeUrl}'`, `geoip_download_url: '${geoipUrl}'`],
        restart: true,
        link: docs('state-db', 'ov.lim.docsStateDb')
      };
    if (geodata.configurable_sources === true)
      return {reason: t('ov.lim.geoNoUrl'), link: {href: href('settings', {card: 'geodata'}), text: t('settings.geodata')}};
    return {reason: t('ov.lim.geoOther')};
  };
  const explain = (cause: LimitCause): Omit<LimitGroup, 'cause' | 'items'> => {
    switch (cause) {
      case 'configNotLoaded':
        return {reason: t(honk ? 'ov.lim.configMissing' : 'ov.lim.configMissingOther')};
      case 'configReadOnly':
        return honk
          ? {reason: t('ov.lim.configWrite'), keys: ['config_write: true'], restart: true, link: docs('read-only', 'ov.lim.docsReadOnly')}
          : {reason: t('ov.lim.configWriteOther')};
      case 'mainReadOnly':
        return {reason: t(honk ? 'ov.lim.mainReadOnly' : 'ov.lim.mainReadOnlyOther'), link: docs('read-only', 'ov.lim.docsReadOnly')};
      case 'recordOff':
        return {reason: t('ov.lim.recordOff'), keys: recordKeys, restart: true};
      case 'geodataUpdate':
        return geodataReason();
      case 'geodataUnreadable':
        return {reason: t('ov.lim.geoUnreadable')};
      case 'notRunning':
        return {reason: t(honk ? 'ov.lim.notRunningReason' : 'ov.lim.notRunningOther')};
      case 'flowsIdle':
        return {
          reason: t(honk ? 'ov.lim.flowsIdle' : 'ov.lim.flowsSwitch'),
          link: {href: href('settings', {card: 'runtime'}), text: t('settings.runtime')}
        };
      case 'notProvided':
        return honk ? {reason: t('ov.lim.notProvided'), link: docs('honk-version', 'ov.lim.docsVersion')} : {reason: t('ov.lim.notProvidedOther')};
    }
  };
  return limitCauses.flatMap(cause => {
    const items = found.get(cause);
    return items ? [{cause, ...explain(cause), items}] : [];
  });
}

// The download URLs of the docs' example configuration (docs/en/configuration.md).
const geositeUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat';
const geoipUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat';

// A group's keys as the honk section that holds them.
export function limitSnippet(keys: string[]): string {
  return ['experimental {', '  native_api {', ...keys.map(key => '    ' + key), '  }', '}'].join('\n');
}
