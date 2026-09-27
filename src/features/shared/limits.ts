import type {Capabilities, Version} from '../../api/model';
import {formatList, type Key, type Lang, type Translator as LabelFn} from '../../i18n';
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
  rules: 'rule.listTitle',
  config: 'nav.config',
  config_validate: 'ov.r.configValidate',
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
const limitCauses = [
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
// `manage` stands for adding and editing nodes and subscriptions, `subscriptions` for refreshing them, `close` for
// closing connections.
export type LimitId = Resource | 'manage' | 'subscriptions' | 'close';

type LimitLink = {href: string; text: string; external?: boolean};
export type LimitGroup = {
  cause: LimitCause;
  // The result in plain words, said once for every feature in the group.
  headline: string;
  items: {id: LimitId; label: string}[];
  // The features as one list; absent when the headline already names every one.
  features?: string;
  // One action beside the headline: help on the cause and how to lift it, or a link.
  help?: LimitHelp;
  link?: LimitLink;
};
export type LimitHelp = {
  label: string;
  text: string;
  // honk settings inside `experimental { native_api { } }` that lift the limit; absent on another backend.
  keys?: string[];
  link?: LimitLink;
};

// The backend features that are off or limited, grouped by why, so each cause is explained once. A feature appears
// in at most one group, and a resource absent from every group is available.
export function backendLimits(capabilities: Capabilities, version: Pick<Version, 'api'> | undefined, t: LabelFn, lang: Lang): LimitGroup[] {
  const resources = capabilities.resources;
  const honk = version?.api.name === 'dae/honk-native';
  // honk's reasons for a resource that is off hold only for one it reports: a resource an older build leaves out is
  // off because that build does not have it, which is all the page can say.
  const reports = (id: Resource) => honk && !capabilities.unreported?.includes(id);
  const found = new Map<LimitCause, LimitGroup['items']>();
  const add = (cause: LimitCause, id: LimitId, label: Key = resourceLabels[id as Resource]) => {
    const items = found.get(cause) ?? [];
    items.push({id, label: t(label)});
    found.set(cause, items);
  };
  const docs = (anchor: DocsAnchor, text: Key): LimitLink | undefined => (honk ? {href: docsHref(lang, anchor), text: t(text), external: true} : undefined);
  const why = (text: Key, link?: LimitLink): LimitHelp => ({label: t('ov.lim.why'), text: t(text), link});
  // honk reads native_api only at startup, so each fix with keys ends with a restart.
  const howTo = (text: Key, keys: string[], link?: LimitLink): LimitHelp => ({label: t('ov.lim.howTo'), text: t(text), keys, link});

  // Writing needs the sources loaded, so a configuration that is not loaded is also not writable (honk config.rs
  // writable, can_manage); node management and geodata updates need writes too and share the configuration's cause.
  const configCause: LimitCause | null = !resources.config.available ? 'configNotLoaded' : resources.config.writable !== true ? 'configReadOnly' : null;
  if (configCause) add(configCause, 'config');
  // honk config.rs running: validation needs the sources loaded too, so it shares that cause and no other.
  const validateUnloaded = !resources.config_validate.available && configCause === 'configNotLoaded';
  if (validateUnloaded) add('configNotLoaded', 'config_validate');
  if (resources.nodes.can_manage === false || resources.providers.can_manage === false) add(configCause ?? 'mainReadOnly', 'manage', 'ov.lim.manage');

  // honk settings.rs capability: `flows.max_flows` is offered only while record_flows allows recording.
  // A backend that does not list its fields does not say either way.
  const fields = resources.runtime_settings.fields;
  const flowsAllowed = !resources.runtime_settings.available || !fields || fields.includes('flows.max_flows');
  const flowsSwitch = resources.runtime_settings.available && (resources.runtime_settings.fields ?? []).includes('record_flows');
  const recordKeys: string[] = [];
  for (const id of Object.keys(resourceLabels) as Resource[]) {
    const resource = resources[id];
    const recorder = recorders[id];
    if (id === 'config' || (id === 'config_validate' && validateUnloaded)) continue;
    const flowsOff = id === 'flows' && resource.available && resources.flows.recording === 'off';
    // Flows stay available with recording off, so their recorder is off only when honk no longer offers max_flows.
    if (reports(id) && recorder && (id === 'flows' ? flowsOff && !flowsAllowed : !resource.available)) {
      add('recordOff', id);
      recordKeys.push(recorder + ': true');
    } else if (flowsOff) add('flowsIdle', id);
    else if (resource.available) {
      if (id === 'geodata' && resources.geodata.can_update !== true) add(configCause ?? 'geodataUpdate', id);
      if (id === 'providers' && resources.providers.can_refresh === false) add('notRunning', 'subscriptions', 'ov.lim.subscriptions');
      if (id === 'connections' && resources.connections.can_close === false) add('notProvided', 'close', 'ov.lim.close');
    } else if (reports(id) && id === 'probes') add('notRunning', id);
    // honk geodata.rs capability: unavailable only when routing and DNS loaded different files of one kind.
    else if (reports(id) && id === 'geodata') add('geodataUnreadable', id);
    else add('notProvided', id);
  }

  const geodataHelp = (): LimitHelp | undefined => {
    const geodata = resources.geodata;
    if (geodata.assets?.length === 0) return why('ov.lim.geoNoAssets');
    // Without the state database honk has no built-in URLs and takes the two from the configuration file.
    if (honk && geodata.configurable_sources !== true)
      return howTo(
        'ov.lim.geoNoStateDb',
        [`geosite_download_url: '${geositeUrl}'`, `geoip_download_url: '${geoipUrl}'`],
        docs('state-db', 'ov.lim.docsStateDb')
      );
    if (geodata.configurable_sources === true) return why('ov.lim.geoNoUrl', {href: href('settings', {card: 'geodata'}), text: t('settings.geodata')});
    // Another backend says no more than the headline.
    return undefined;
  };
  // The headline, the ids it names (the features line is omitted when the headline already names every feature), and
  // the action. A help text that would only repeat the headline, as another backend's often would, is left out.
  const explain = (cause: LimitCause, items: LimitGroup['items']): {headline: string; named?: LimitId[]; help?: LimitHelp; link?: LimitLink} => {
    const n = items.length;
    switch (cause) {
      case 'configNotLoaded':
        return {headline: t('ov.lim.h.configNotLoaded'), named: ['config'], help: honk ? why('ov.lim.configMissing') : undefined};
      case 'configReadOnly':
        return {
          headline: t('ov.lim.h.configReadOnly'),
          named: ['config'],
          // A build that does not report the switch may not have it.
          help:
            honk && resources.config.writable === false
              ? howTo('ov.lim.configWrite', ['config_write: true'], docs('read-only', 'ov.lim.docsReadOnly'))
              : undefined
        };
      case 'mainReadOnly':
        return {
          headline: t('ov.lim.h.mainReadOnly'),
          named: ['manage'],
          help: honk ? why('ov.lim.mainReadOnly', docs('read-only', 'ov.lim.docsReadOnly')) : why('ov.lim.mainReadOnlyOther')
        };
      case 'recordOff':
        return {headline: t('ov.lim.h.recordOff', {n}), help: howTo('ov.lim.recordOff', recordKeys)};
      case 'geodataUpdate':
        return {headline: t('ov.lim.h.geodataUpdate'), named: ['geodata'], help: geodataHelp()};
      case 'geodataUnreadable':
        return {headline: t('ov.lim.h.geodataUnreadable'), named: ['geodata'], help: why('ov.lim.geoUnreadable')};
      case 'notRunning':
        return {
          headline: n > 1 ? t('ov.lim.h.notRunning', {n}) : t(items[0].id === 'probes' ? 'ov.lim.h.probes' : 'ov.lim.h.subscriptions'),
          named: n > 1 ? [] : [items[0].id],
          help: honk ? why('ov.lim.notRunningReason') : undefined
        };
      case 'flowsIdle':
        return {
          headline: t(honk ? 'ov.lim.h.flowsIdle' : 'ov.lim.h.flowsOff'),
          named: ['flows'],
          // Without the record_flows switch Settings has nothing to turn on.
          link: flowsSwitch ? {href: href('settings', {card: 'runtime'}), text: t('settings.runtime')} : undefined
        };
      case 'notProvided':
        return {headline: t(honk ? 'ov.lim.h.notProvided' : 'ov.lim.h.notProvidedOther', {n}), link: docs('honk-version', 'ov.lim.docsVersion')};
    }
  };
  return limitCauses.flatMap(cause => {
    const items = found.get(cause);
    if (!items) return [];
    const {named = [], ...rest} = explain(cause, items);
    const others = items.filter(item => !named.includes(item.id));
    return [
      {
        cause,
        ...rest,
        items,
        features:
          others.length > 0
            ? formatList(
                lang,
                items.map(item => item.label)
              )
            : undefined
      }
    ];
  });
}

// The download URLs of the docs' example configuration (docs/en/configuration.md).
const geositeUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat';
const geoipUrl = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat';

// A group's keys as the honk section that holds them.
export function limitSnippet(keys: string[]): string {
  return ['experimental {', '  native_api {', ...keys.map(key => '    ' + key), '  }', '}'].join('\n');
}
