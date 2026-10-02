import type {Capabilities, ConnectionList, DnsRuleList, Node, GroupSummary, ProviderList, EffectiveConfig, RuleList} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {formatList, formatNumber, isLoaded, languages, LOCALE, translate, type Key, type Lang, type Translator} from '../../i18n';
import {chainLabel, connectionRows} from '../../api/selectors';
import {offered} from '../../api/capabilities';
import {features, navAvailable} from '../registry';
import type {RoutePath} from '../routes';
import type {Engine} from '../../api/engines';
import {parseHash, within} from '../route';
import {dnsRuleTarget} from '../../dae/ruleText';
import {settingGroups, type SettingsSection} from '../../dae/settings';
import {dnsTabs} from '../../features/dns/nav';
import {rulesTabs, rulesTargets} from '../../features/rules/nav';
import {flowsTabs} from '../../features/flows/nav';
import {geodataConfigurable, runtimeFieldLabels, settingsCardList, settingsFields} from '../../features/settings/nav';
import {configSections, configTabs, configTargets} from '../../features/config/nav';
import {sourceKinds} from '../../dae/sources';
import {connectionsTabs} from '../../features/connections/nav';
import {nodesTabs, nodesTargets} from '../../features/nodes/nav';
import {policiesTargets} from '../../features/policies/nav';
import {nodeHref} from '../../features/shared/link';
import {widgetTargets} from '../widgets/editorState';

// `open` opens a shell editor where a hit has no page (route null).
type SearchHit = {id: string; label: string; description: string | undefined; route: RoutePath | null; query: string; open?: () => void};
// A hit with its lower-cased match text, projected once per dataset so a keystroke only filters.
type SearchEntry = {hit: SearchHit; keys: string[]};
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
export type SearchIndex = {sections: Array<{id: string; title: string; entries: SearchEntry[]}>; partial: string | null};
type SearchView = {sections: Array<{id: string; title: string; items: SearchHit[]}>; byId: Map<string, SearchHit>; partial: string | null};
const entry = (
  keys: Array<string | null | undefined>,
  id: string,
  label: string,
  description: string | undefined,
  route: RoutePath | null,
  query = '',
  open?: () => void
): SearchEntry => ({
  hit: {id, label, description, route, query, ...(open && {open})},
  keys: [...new Set(keys.flatMap(key => (key == null ? [] : [normalize(key)])))]
});
// A hit that opens a link the app already builds.
const linked = (keys: Array<string | null | undefined>, id: string, label: string, description: string | undefined, link: string) => {
  const {route, query} = parseHash(link);
  return entry(keys, id, label, description, route, query);
};
// A label in the interface language and in every other loaded one, alone and after its parent's, so 配色 and palette
// find the same field whichever language the interface shows.
function labels(t: Translator, key: Key, parentKey?: Key): string[] {
  const words = [{title: t(key), parent: parentKey && t(parentKey)}];
  for (const language of languages) {
    if (isLoaded(language.id)) words.push({title: translate(language.id, key), parent: parentKey && translate(language.id, parentKey)});
  }
  return words.flatMap(({title, parent}) => (parent ? [title, parent + ' ' + title] : [title]));
}

export function pageEntries(capabilities: Capabilities | undefined, t: Translator, hasGlobal: boolean): SearchEntry[] {
  const available = (path: string) => navAvailable(path, capabilities);
  const resources = capabilities?.resources;
  // Each page's own tab list, so search offers exactly the tabs the page shows.
  const subpages: Array<{path: RoutePath; params: Record<string, string>; titleKey: Key; aliases?: readonly string[]}> = [
    ...connectionsTabs().map(tab => ({path: 'connections' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...nodesTabs(resources).map(tab => ({path: 'nodes' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...flowsTabs(resources).map(tab => ({path: 'flows' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...rulesTabs(resources).map(tab => ({path: 'rules' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...dnsTabs(resources).map(tab => ({path: 'dns' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...configTabs(hasGlobal, capabilities).map(tab => ({path: 'config' as const, params: {tab: tab.id}, titleKey: tab.titleKey, aliases: tab.aliases})),
    ...settingsCardList(resources).map(card => ({path: 'settings' as const, params: {card: card.id}, titleKey: card.titleKey, aliases: card.aliases}))
  ];
  const parentKey = (path: RoutePath) => features.find(f => f.path === path)!.nav!.titleKey;
  return [
    ...features
      .filter(feature => feature.nav && available(feature.path))
      .map(feature => entry(labels(t, feature.nav!.titleKey), `page:${feature.path}?`, t(feature.nav!.titleKey), undefined, feature.path)),
    ...subpages
      .filter(item => available(item.path))
      .map(item => {
        const query = within('', item.params);
        return entry(
          [...labels(t, item.titleKey, parentKey(item.path)), ...(item.aliases ?? [])],
          `page:${item.path}?${query}`,
          t(item.titleKey),
          t(parentKey(item.path)),
          item.path,
          query
        );
      })
  ];
}
// Each Settings control, under the card that holds it; `?field=` focuses it there. The runtime card offers the fields
// the backend lets it change.
export function settingsEntries(capabilities: Capabilities | undefined, t: Translator): SearchEntry[] {
  const resources = capabilities?.resources;
  const cards = new Map(settingsCardList(resources).map(card => [card.id, card]));
  const runtime = new Set(resources?.runtime_settings.available ? (resources.runtime_settings.fields ?? []) : []);
  const runtimeFields = Object.entries(runtimeFieldLabels)
    .filter(([id]) => runtime.has(id as keyof typeof runtimeFieldLabels))
    .map(([id, labelKey]) => ({id, labelKey, card: 'runtime' as const, aliases: undefined}));
  const sources = geodataConfigurable(resources);
  return [...settingsFields.filter(field => !field.sources || sources), ...runtimeFields].flatMap(field => {
    const card = cards.get(field.card);
    if (!card) return [];
    return [
      entry(
        [...labels(t, field.labelKey), ...(field.aliases ?? [])],
        `setting:${field.id}`,
        t(field.labelKey),
        t(card.titleKey),
        'settings',
        within('', {card: field.card, field: field.id})
      )
    ];
  });
}
// The engine's persistent global settings, each focused on the configuration page's global tab by its key.
export function globalSettingEntries(section: SettingsSection | null, capabilities: Capabilities | undefined, t: Translator): SearchEntry[] {
  if (!section || !offered(capabilities?.resources, 'config', {whileLoading: false})) return [];
  return section.fields.map(field =>
    entry(
      [...labels(t, field.label), field.key],
      `global:${field.key}`,
      t(field.label),
      t(settingGroups[field.group]),
      'config',
      within('', {tab: 'global', field: field.key})
    )
  );
}
// The feature entry points each page registers beside its tabs (see SearchTarget).
export function featureEntries(capabilities: Capabilities | undefined, t: Translator): SearchEntry[] {
  const resources = capabilities?.resources;
  return [...rulesTargets(resources), ...policiesTargets(resources), ...nodesTargets(resources), ...configTargets(capabilities), ...widgetTargets]
    .filter(target => target.route === null || navAvailable(target.route, capabilities))
    .map(target =>
      entry(
        [...labels(t, target.titleKey, target.parentKey), ...(target.aliasKeys ?? []).flatMap(key => labels(t, key)), ...(target.aliases ?? [])],
        `feature:${target.id}`,
        t(target.titleKey),
        target.parentKey && t(target.parentKey),
        target.route,
        within('', target.params ?? {}),
        target.open
      )
    );
}
// Each top-level section the configuration defines, by its name and the summary the Modules tab shows, opened at its
// first line.
export function moduleEntries(config: EffectiveConfig | undefined, engine: Engine, t: Translator): SearchEntry[] {
  return configSections(config, engine, t).map(section =>
    linked([section.kind, section.summary], `module:${section.id}`, section.kind, section.range, section.href)
  );
}
export function connectionEntries(connections: ConnectionList | undefined, t: Translator): SearchEntry[] {
  return connectionRows(connections).map(c =>
    entry([c.domain, c.dst, c.src], `connection:${c.id}`, c.domain || c.dst || c.src || c.id, chainLabel(c, t), 'connections', within('', {id: c.id}))
  );
}
export function nodeEntries(nodes: Node[] | undefined, providers: ProviderList | undefined, lang: Lang): SearchEntry[] {
  const listed = providers?.providers ?? [];
  return (nodes ?? []).map(n => linked([n.name], `node:${n.id}`, n.name, formatList(lang, n.group_ids) || undefined, nodeHref(n, listed, true)));
}
export function groupEntries(groups: GroupSummary[] | undefined): SearchEntry[] {
  return (groups ?? []).map(g => entry([g.name], `group:${g.id}`, g.name, g.policy.native, 'policies', within('', {group: g.id})));
}
export function providerEntries(providers: ProviderList | undefined, t: Translator): SearchEntry[] {
  return (providers?.providers ?? []).map(p =>
    entry([p.name], `provider:${p.id}`, p.name, t('search.nodeCount', {n: p.node_count}), 'nodes', within('', {provider: p.id}))
  );
}
export function sourceEntries(config: EffectiveConfig | undefined, t: Translator): SearchEntry[] {
  return (config?.sources ?? []).map(source =>
    entry([source.path], `source:${source.id}`, source.path, enumLabel(sourceKinds, source.kind, t), 'config', within('', {tab: 'source', source: source.id}))
  );
}
export function ruleEntries(rules: RuleList | undefined, lang: Lang): SearchEntry[] {
  return (rules?.rules ?? [])
    .filter(rule => rule.kind === 'rule')
    .map(rule =>
      entry(
        [rule.expression, rule.outbound],
        `rule:${rule.rule_id}`,
        rule.expression,
        `#${formatNumber(rule.index + 1, LOCALE[lang])} → ${rule.outbound}`,
        'rules',
        within('', {tab: 'list', rule: rule.rule_id})
      )
    );
}
// A hit selects its rule in its list on the DNS tab.
export function dnsRuleEntries(rules: DnsRuleList | undefined, lang: Lang, t: Translator): SearchEntry[] {
  const lists = [
    {id: 'request', list: rules?.request ?? [], title: t('rule.dns.request')},
    {id: 'response', list: rules?.response ?? [], title: t('rule.dns.response')}
  ];
  return lists.flatMap(({id, list, title}) =>
    list
      .filter(rule => rule.kind === 'rule')
      .map(rule =>
        entry(
          [rule.expression, dnsRuleTarget(rule)],
          `dns-rule:${rule.rule_id}`,
          rule.expression,
          `${title} #${formatNumber(rule.index + 1, LOCALE[lang])} → ${dnsRuleTarget(rule)}`,
          'rules',
          within('', {tab: 'dns', list: id, rule: rule.rule_id})
        )
      )
  );
}
export function searchSections(
  entries: Record<
    'pages' | 'settings' | 'globals' | 'features' | 'conns' | 'nodes' | 'groups' | 'providers' | 'sources' | 'modules' | 'rules' | 'dnsRules',
    SearchEntry[]
  >,
  connections: ConnectionList | undefined,
  t: Translator
): SearchIndex {
  return {
    sections: [
      {id: 'pages', title: t('search.pages'), entries: entries.pages},
      {id: 'settings', title: t('nav.settings'), entries: entries.settings},
      {id: 'globals', title: t('config.tabGlobal'), entries: entries.globals},
      {id: 'features', title: t('search.features'), entries: entries.features},
      {id: 'conns', title: t('nav.connections'), entries: entries.conns},
      {id: 'nodes', title: t('search.nodes'), entries: entries.nodes},
      {id: 'groups', title: t('search.groups'), entries: entries.groups},
      {id: 'providers', title: t('search.providers'), entries: entries.providers},
      {id: 'sources', title: t('search.sources'), entries: entries.sources},
      {id: 'modules', title: t('config.tabModules'), entries: entries.modules},
      {id: 'rules', title: t('nav.rules'), entries: entries.rules},
      {id: 'dnsRules', title: t('rule.dnsTitle'), entries: entries.dnsRules}
    ],
    partial: connections?.truncated ? t('conn.truncated') : null
  };
}
// 0 when a key is the query, 1 when one starts with it, 2 when one holds it, 3 when none matches.
function rank(keys: string[], needle: string): number {
  let best = 3;
  for (const key of keys) {
    if (key === needle) return 0;
    if (key.startsWith(needle)) best = 1;
    else if (best === 3 && key.includes(needle)) best = 2;
  }
  return best;
}
// Each section lists its best matches: exact before prefix before substring, ties in the section's own order, so an
// early substring match cannot crowd out a later exact one.
export function searchView(q: string, index: SearchIndex): SearchView {
  const needle = normalize(q);
  const limit = needle ? 8 : 5;
  const byId = new Map<string, SearchHit>();
  const sections = index.sections.map(section => {
    const items = needle
      ? section.entries
          .map((entry, order) => ({hit: entry.hit, order, rank: rank(entry.keys, needle)}))
          .filter(match => match.rank < 3)
          .sort((a, b) => a.rank - b.rank || a.order - b.order)
          .slice(0, limit)
          .map(match => match.hit)
      : section.entries.slice(0, limit).map(entry => entry.hit);
    for (const hit of items) byId.set(hit.id, hit);
    return {id: section.id, title: section.title, items};
  });
  return {sections: sections.filter(section => section.items.length > 0), byId, partial: index.partial};
}
