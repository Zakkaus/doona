import {engineOf, type EngineReason} from '../../api/engines';
import type {Capabilities, RuntimeSettings, Version} from '../../api/model';
import {formatList, type Key, type Lang, type Translator as LabelFn} from '../../i18n';
import {docsHref, type DocsAnchor} from './docs';
import type {LimitId, Resource} from './limitCauses';

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
} as const satisfies Record<Resource, Key>;
// Each feature's label and its section in the docs' feature requirements.
export const limitInfo: Record<LimitId, [label: Key, docs: DocsAnchor]> = {
  connections: [resourceLabels.connections, 'req-connections'],
  flows: [resourceLabels.flows, 'req-flows'],
  routing_trace: [resourceLabels.routing_trace, 'req-routing-trace'],
  dns_query: [resourceLabels.dns_query, 'req-dns-query'],
  dns_cache: [resourceLabels.dns_cache, 'req-dns-cache'],
  dns_log: [resourceLabels.dns_log, 'req-dns-log'],
  events: [resourceLabels.events, 'req-events'],
  probes: [resourceLabels.probes, 'req-probes'],
  traffic_history: [resourceLabels.traffic_history, 'req-traffic-history'],
  memory_history: [resourceLabels.memory_history, 'req-traffic-history'],
  runtime_outbounds: [resourceLabels.runtime_outbounds, 'req-runtime-status'],
  logs: [resourceLabels.logs, 'req-logs'],
  providers: [resourceLabels.providers, 'req-nodes'],
  rules: [resourceLabels.rules, 'req-rules'],
  config: [resourceLabels.config, 'req-config-edit'],
  config_validate: [resourceLabels.config_validate, 'req-validation'],
  runtime_settings: [resourceLabels.runtime_settings, 'req-runtime-options'],
  geodata: [resourceLabels.geodata, 'req-geodata'],
  dns_rules: ['ov.r.dnsRules', 'req-rules'],
  reload: ['ov.r.reload', 'req-reload-suspend'],
  suspend: ['ov.r.suspend', 'req-reload-suspend'],
  resume: ['ov.r.resume', 'req-reload-suspend'],
  manage: ['ov.lim.manage', 'req-nodes'],
  subscriptions: ['ov.lim.subscriptions', 'req-subscription-refresh'],
  close: ['ov.lim.close', 'req-connections'],
  create: ['ov.lim.create', 'req-config-edit'],
  validate_full: ['ov.lim.validateFull', 'req-validation'],
  global_settings: ['ov.lim.globalSettings', 'req-config-edit'],
  mode: ['ov.lim.mode', 'req-config-edit'],
  rule_edit: ['ov.lim.ruleEdit', 'req-rules'],
  export: ['ov.lim.export', 'req-revisions'],
  import: ['ov.lim.import', 'req-revisions'],
  revisions: ['ov.lim.revisions', 'req-revisions'],
  restore: ['ov.lim.restore', 'req-revisions'],
  group_edit: ['ov.lim.groupEdit', 'req-group-edit'],
  selection: ['ov.lim.selection', 'req-group-selection'],
  trace_live: ['ov.lim.traceLive', 'req-routing-trace'],
  dns_cache_read: ['ov.lim.dnsCacheRead', 'req-dns-cache'],
  dns_cache_delete: ['ov.lim.dnsCacheDelete', 'req-dns-cache'],
  dns_cache_flush: ['ov.lim.dnsCacheFlush', 'req-dns-cache'],
  geodata_settings: ['ov.lim.geodataSettings', 'req-geodata-settings']
};

export type LimitLink = {href: string; text: string; external?: boolean};

// One feature's explanation where it is hidden or off: the text its group gives, the settings that turn it on and its
// docs section.
export type LimitHint = {text: string; setting?: string; link: LimitLink};

// The help text for each engine reason, with the docs section on it. `recorded-on-demand` and `build-lacks` change
// the headline instead.
export const reasonHelp: Partial<Record<EngineReason['code'], {text: Key; docs?: [DocsAnchor, Key]}>> = {
  'config-unloaded': {text: 'ov.lim.configMissing'},
  'writes-off': {text: 'ov.lim.configWrite', docs: ['read-only', 'ov.lim.docsReadOnly']},
  'main-file-read-only': {text: 'ov.lim.mainReadOnly', docs: ['read-only', 'ov.lim.docsReadOnly']},
  'recorder-off': {text: 'ov.lim.recordOff'},
  'no-download-urls': {text: 'ov.lim.geoNoStateDb', docs: ['state-db', 'ov.lim.docsStateDb']},
  'geodata-mismatch': {text: 'ov.lim.geoUnreadable'},
  'starting-or-stopping': {text: 'ov.lim.notRunningReason'},
  'start-flag': {text: 'ov.lim.startFlag'},
  'state-db-closed': {text: 'ov.lim.stateDbClosed', docs: ['state-db', 'ov.lim.docsStateDb']}
};
// The engine names the flag, the credentials and the write switch; the text only places them.
export const reasonText = (t: LabelFn, reason: EngineReason) =>
  t(
    reasonHelp[reason.code]!.text,
    reason.code === 'start-flag'
      ? {flag: reason.flag, credential: reason.credentials.join(t('ui.listOr'))}
      : reason.code === 'state-db-closed'
        ? {key: reason.writeSwitch}
        : undefined
  );
// A feature's requirements; geodata that is available but cannot be updated links the update section.
export function featureLink(t: LabelFn, lang: Lang, id: LimitId, code?: EngineReason['code']): LimitLink {
  const anchor = id === 'geodata' && code !== 'geodata-mismatch' ? 'req-geodata-update' : limitInfo[id][1];
  return {href: docsHref(lang, anchor), text: t('ov.lim.docsFor', {feature: t(limitInfo[id][0])}), external: true};
}

// The hint for a feature that is off, with the same text as its group here; undefined when the engine gives no reason
// the overview explains.
export const limitHint = (
  id: LimitId,
  capabilities: Capabilities,
  version: Pick<Version, 'engine'> | undefined,
  t: LabelFn,
  lang: Lang,
  recording?: RuntimeSettings['recording']
): LimitHint | undefined => reasonHint(id, engineOf(version).reason(id, capabilities, recording), t, lang);
// The same hint from the reason the engine already gave for the feature.
export function reasonHint(id: LimitId, reason: EngineReason | undefined, t: LabelFn, lang: Lang): LimitHint | undefined {
  if (!reason || !reasonHelp[reason.code]) return undefined;
  const keys = 'settings' in reason ? reason.settings.map(setting => setting.key) : [];
  return {text: reasonText(t, reason), setting: keys.length > 0 ? formatList(lang, keys) : undefined, link: featureLink(t, lang, id, reason.code)};
}
