import type {Capabilities, Version} from '../../api/model';
import type {Key, Translator as LabelFn} from '../../i18n';
import {href} from '../../shell/route';

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

// Every honk switch named here lives under this section, which honk reads only at startup.
export const nativeApiSection = 'experimental.native_api';
const nativeApi = (setting: string) => `${nativeApiSection}.${setting}`;
// Recorders honk leaves off unless its configuration turns them on.
const recorders: Partial<Record<Resource, string>> = {
  traffic_history: 'record_traffic',
  memory_history: 'record_memory',
  logs: 'record_logs',
  dns_log: 'record_dns_log'
};

export type BackendLimit = {
  id: string;
  label: string;
  state: string;
  reason: string;
  // honk configuration that lifts the limit; empty for another backend or where no setting helps.
  keys: string[];
  link?: {href: string; text: string};
};

// The backend features that are off or limited, each with why and, on honk, the setting that turns it on. Every
// resource that is unavailable appears here, so the rest of the resources are available.
export function backendLimits(capabilities: Capabilities, version: Pick<Version, 'api'> | undefined, t: LabelFn): BackendLimit[] {
  const resources = capabilities.resources;
  const honk = version?.api.name === 'dae/honk-native';
  const notProvided = t('ov.lim.notProvided');
  const item = (id: Resource, state: Key, reason: string, keys: string[] = [], link?: BackendLimit['link']): BackendLimit => ({
    id,
    label: t(resourceLabels[id]),
    state: t(state),
    reason,
    keys: honk ? keys : [],
    link
  });
  const configWritable = resources.config.available && resources.config.writable === true;
  const limits: BackendLimit[] = [];
  if (!resources.config.available) limits.push(item('config', 'ov.lim.notLoaded', t('ov.lim.configMissing')));
  else if (!configWritable)
    // Several conditions in honk collapse into this one flag, so the reason names what writing requires.
    limits.push(
      item('config', 'config.readOnly', honk ? t('ov.lim.configWrite') : notProvided, [
        nativeApi('config_write: true'),
        nativeApi('secret'),
        nativeApi('password_auth: true')
      ])
    );
  for (const id of Object.keys(resourceLabels) as Resource[]) {
    if (id === 'config') continue;
    const recorder = recorders[id];
    if (recorder && !resources[id].available) {
      limits.push(item(id, 'ov.lim.notRecorded', honk ? t('ov.lim.recordOff') : notProvided, [nativeApi(recorder + ': true')]));
    } else if (id === 'probes' && !resources.probes.available) {
      limits.push(item(id, 'ov.lim.notRunning', t('ov.lim.probesOff')));
    } else if (!resources[id].available) {
      limits.push(item(id, 'ov.notAvailable', notProvided));
    } else if (id === 'flows' && resources.flows.recording === 'off') {
      // Recording can be switched while running; honk's setting is only the default it starts with.
      const switchable = resources.runtime_settings.available && (resources.runtime_settings.fields ?? []).includes('record_flows');
      limits.push(
        item(
          id,
          'ov.lim.notRecorded',
          switchable ? t(honk ? 'ov.lim.flowsSwitchDefault' : 'ov.lim.flowsSwitch') : honk ? t('ov.lim.recordOff') : notProvided,
          [nativeApi('record_flows: true')],
          switchable ? {href: href('settings', {card: 'runtime'}), text: t('settings.runtime')} : undefined
        )
      );
    } else if (id === 'geodata' && resources.geodata.can_update !== true) {
      const geodata = resources.geodata;
      if (!configWritable) limits.push(item(id, 'ov.lim.noUpdate', t('ov.lim.geoNeedsConfig')));
      else if (geodata.configurable_sources !== true)
        limits.push(
          item(id, 'ov.lim.noUpdate', honk ? t('ov.lim.geoNoSources') : notProvided, [
            nativeApi('geosite_download_url'),
            nativeApi('geoip_download_url'),
            '<data_dir>/state/honk.db'
          ])
        );
      else limits.push(item(id, 'ov.lim.noUpdate', t('ov.lim.geoNoUrl'), [], {href: href('settings', {card: 'geodata'}), text: t('settings.geodata')}));
    } else if (id === 'providers' && resources.providers.can_refresh === false) {
      limits.push({...item(id, 'ov.lim.noRefresh', t('ov.lim.subscriptionsOff')), label: t('ov.lim.subscriptions')});
    }
    if (id === 'providers' && (resources.nodes.can_manage === false || resources.providers.can_manage === false))
      limits.push({id: 'manage', label: t('ov.lim.manage'), state: t('ov.lim.noEdit'), reason: t('ov.lim.mainReadOnly'), keys: []});
  }
  return limits;
}
