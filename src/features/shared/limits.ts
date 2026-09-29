import {engineOf, type EngineReason} from '../../api/engines';
import type {Capabilities, Version} from '../../api/model';
import {formatList, type Key, type Lang, type Translator as LabelFn} from '../../i18n';
import {href} from '../../shell/route';
import {docsHref, type DocsAnchor} from './docs';

export const resourceLabels = {
  connections: 'nav.connections',
  flows: 'flow.records',
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
// `manage`, `subscriptions` and `close` are the resource actions of the same names in EngineSubject.
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
  // The engine's configuration text with the settings that lift the limit; absent when the engine names none.
  snippet?: string;
  link?: LimitLink;
};

// The group a resource that is off joins by the engine's reason; one the engine gives no such reason for is not
// provided, or, for flows that are off, idle.
const reasonCause: Partial<Record<EngineReason['code'], LimitCause>> = {
  'recorder-off': 'recordOff',
  'starting-or-stopping': 'notRunning',
  'geodata-mismatch': 'geodataUnreadable'
};
// The help text for each engine reason, with the docs section on it. `recorded-on-demand` and `build-lacks` change
// the headline instead.
const reasonHelp: Partial<Record<EngineReason['code'], {text: Key; docs?: [DocsAnchor, Key]}>> = {
  'config-unloaded': {text: 'ov.lim.configMissing'},
  'writes-off': {text: 'ov.lim.configWrite', docs: ['read-only', 'ov.lim.docsReadOnly']},
  'main-file-read-only': {text: 'ov.lim.mainReadOnly', docs: ['read-only', 'ov.lim.docsReadOnly']},
  'recorder-off': {text: 'ov.lim.recordOff'},
  'no-download-urls': {text: 'ov.lim.geoNoStateDb', docs: ['state-db', 'ov.lim.docsStateDb']},
  'geodata-mismatch': {text: 'ov.lim.geoUnreadable'},
  'starting-or-stopping': {text: 'ov.lim.notRunningReason'}
};

// The backend features that are off or limited, grouped by why, so each cause is explained once. A feature appears
// in at most one group, and a resource absent from every group is available. The contract says what is off; the
// engine adapter adds why, where it knows.
export function backendLimits(capabilities: Capabilities, version: Pick<Version, 'engine'> | undefined, t: LabelFn, lang: Lang): LimitGroup[] {
  const resources = capabilities.resources;
  const engine = engineOf(version);
  const reason = (id: LimitId) => engine.reason(id, capabilities);
  const found = new Map<LimitCause, LimitGroup['items']>();
  const add = (cause: LimitCause, id: LimitId, label: Key = resourceLabels[id as Resource]) => {
    const items = found.get(cause) ?? [];
    items.push({id, label: t(label)});
    found.set(cause, items);
  };
  const docs = (anchor: DocsAnchor, text: Key): LimitLink => ({href: docsHref(lang, anchor), text: t(text), external: true});
  const why = (text: Key, link?: LimitLink): LimitHelp => ({label: t('ov.lim.why'), text: t(text), link});
  // The help for the reasons of a group's features: the first reason the engine gives explains the group, and the
  // settings of all of them go into one snippet.
  const helpFor = (reasons: (EngineReason | undefined)[]): LimitHelp | undefined => {
    const first = reasons.find(r => r !== undefined);
    const entry = first && reasonHelp[first.code];
    if (!entry) return undefined;
    const link = entry.docs && docs(...entry.docs);
    const settings = reasons.flatMap(r => (r && 'settings' in r ? r.settings : []));
    return settings.length > 0 ? {label: t('ov.lim.howTo'), text: t(entry.text), snippet: engine.snippet(settings), link} : why(entry.text, link);
  };

  // Writing needs the sources loaded, so a configuration that is not loaded is also not writable (honk config.rs
  // writable, can_manage); node management and geodata updates need writes too and share the configuration's cause.
  const configCause: LimitCause | null = !resources.config.available ? 'configNotLoaded' : resources.config.writable !== true ? 'configReadOnly' : null;
  if (configCause) add(configCause, 'config');
  // honk config.rs running: validation needs the sources loaded too, so it shares that cause and no other.
  const validateUnloaded = !resources.config_validate.available && configCause === 'configNotLoaded';
  if (validateUnloaded) add('configNotLoaded', 'config_validate');
  if (resources.nodes.can_manage === false || resources.providers.can_manage === false) add(configCause ?? 'mainReadOnly', 'manage', 'ov.lim.manage');

  // Settings can turn flow recording on only through the record_flows switch.
  const flowsSwitch = resources.runtime_settings.available && (resources.runtime_settings.fields ?? []).includes('record_flows');
  for (const id of Object.keys(resourceLabels) as Resource[]) {
    const resource = resources[id];
    if (id === 'config' || (id === 'config_validate' && validateUnloaded)) continue;
    // Flows stay available with recording off.
    const flowsOff = id === 'flows' && resource.available && resources.flows.recording === 'off';
    if (flowsOff || !resource.available) {
      const code = reason(id)?.code;
      add((code && reasonCause[code]) ?? (flowsOff ? 'flowsIdle' : 'notProvided'), id);
    } else {
      if (id === 'geodata' && resources.geodata.can_update !== true) add(configCause ?? 'geodataUpdate', id);
      if (id === 'providers' && resources.providers.can_refresh === false) add('notRunning', 'subscriptions', 'ov.lim.subscriptions');
      if (id === 'connections' && resources.connections.can_close === false) add('notProvided', 'close', 'ov.lim.close');
    }
  }

  const geodataHelp = (): LimitHelp | undefined => {
    const geodata = resources.geodata;
    if (geodata.assets?.length === 0) return why('ov.lim.geoNoAssets');
    const help = helpFor([reason('geodata')]);
    if (help) return help;
    if (geodata.configurable_sources === true) return why('ov.lim.geoNoUrl', {href: href('settings', {card: 'geodata'}), text: t('settings.geodata')});
    // Another backend says no more than the headline.
    return undefined;
  };
  // The headline, the ids it names (the features line is omitted when the headline already names every feature), and
  // the action. A help text that would only repeat the headline, as another backend's often would, is left out.
  const explain = (cause: LimitCause, items: LimitGroup['items']): {headline: string; named?: LimitId[]; help?: LimitHelp; link?: LimitLink} => {
    const n = items.length;
    const reasons = () => items.map(item => reason(item.id));
    switch (cause) {
      case 'configNotLoaded':
        return {headline: t('ov.lim.h.configNotLoaded'), named: ['config'], help: helpFor([reason('config')])};
      case 'configReadOnly':
        return {headline: t('ov.lim.h.configReadOnly'), named: ['config'], help: helpFor([reason('config')])};
      case 'mainReadOnly':
        return {headline: t('ov.lim.h.mainReadOnly'), named: ['manage'], help: helpFor([reason('manage')])};
      case 'recordOff':
        return {headline: t('ov.lim.h.recordOff', {n}), help: helpFor(reasons())};
      case 'geodataUpdate':
        return {headline: t('ov.lim.h.geodataUpdate'), named: ['geodata'], help: geodataHelp()};
      case 'geodataUnreadable':
        return {headline: t('ov.lim.h.geodataUnreadable'), named: ['geodata'], help: helpFor(reasons())};
      case 'notRunning':
        return {
          headline: n > 1 ? t('ov.lim.h.notRunning', {n}) : t(items[0].id === 'probes' ? 'ov.lim.h.probes' : 'ov.lim.h.subscriptions'),
          named: n > 1 ? [] : [items[0].id],
          help: helpFor(reasons())
        };
      case 'flowsIdle':
        return {
          headline: t(reason('flows')?.code === 'recorded-on-demand' ? 'ov.lim.h.flowsIdle' : 'ov.lim.h.flowsOff'),
          named: ['flows'],
          // Without the record_flows switch Settings has nothing to turn on.
          link: flowsSwitch ? {href: href('settings', {card: 'runtime'}), text: t('settings.runtime')} : undefined
        };
      case 'notProvided': {
        const lacks = reasons().some(r => r?.code === 'build-lacks');
        return {
          headline: t(lacks ? 'ov.lim.h.notProvided' : 'ov.lim.h.notProvidedOther', {n}),
          link: lacks ? docs('honk-version', 'ov.lim.docsVersion') : undefined
        };
      }
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
