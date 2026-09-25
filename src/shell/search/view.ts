import type {Capabilities, ConnectionList, Node, GroupSummary, ProviderList, EffectiveConfig, RuleList} from '../../api/model';
import {formatList, formatNumber, LOCALE, type Key, type Lang, type Translator} from '../../i18n';
import {chainLabel, connectionRows, nodeOwner} from '../../api/selectors';
import {features, navAvailable} from '../registry';
import {type RoutePath} from '../routes';
import {within} from '../route';
import {dnsTabs} from '../../features/dns/nav';
import {rulesTabs} from '../../features/rules/nav';
import {settingsCardList} from '../../features/settings/nav';
import {configTabs, setupAvailable, sourceKinds} from '../../features/config/nav';

type SearchHit = {id: string; label: string; description: string | undefined; route: RoutePath; query: string};
// A hit with its lower-cased match text, projected once per dataset so a keystroke only filters.
type SearchEntry = {hit: SearchHit; keys: string[]};
export type SearchIndex = {sections: Array<{id: string; title: string; entries: SearchEntry[]}>; partial: string | null};
type SearchView = {sections: Array<{id: string; title: string; items: SearchHit[]}>; byId: Map<string, SearchHit>; partial: string | null};
const entry = (
  keys: Array<string | null | undefined>,
  id: string,
  label: string,
  description: string | undefined,
  route: RoutePath,
  query = ''
): SearchEntry => ({
  hit: {id, label, description, route, query},
  keys: keys.flatMap(key => (key == null ? [] : [key.toLowerCase()]))
});

export function pageEntries(capabilities: Capabilities | undefined, config: EffectiveConfig | undefined, t: Translator): SearchEntry[] {
  const available = (path: string) => navAvailable(path, capabilities);
  const resources = capabilities?.resources;
  const main = config?.sources.find(source => source.kind === 'main');
  // Each page's own tab list, so search offers exactly the tabs the page shows.
  const subpages: Array<{path: RoutePath; params: Record<string, string>; titleKey: Key}> = [
    ...rulesTabs(resources).map(tab => ({path: 'rules' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...dnsTabs(resources).map(tab => ({path: 'dns' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...configTabs(setupAvailable(resources, main)).map(tab => ({path: 'config' as const, params: {tab: tab.id}, titleKey: tab.titleKey})),
    ...settingsCardList(resources).map(card => ({path: 'settings' as const, params: {card: card.id}, titleKey: card.titleKey}))
  ];
  const places = [
    ...features
      .filter(feature => feature.nav && available(feature.path))
      .map(feature => ({route: feature.path, query: '', title: t(feature.nav!.titleKey), parent: ''})),
    ...subpages
      .filter(item => available(item.path))
      .map(item => ({
        route: item.path,
        query: within('', item.params),
        title: t(item.titleKey),
        parent: t(features.find(f => f.path === item.path)!.nav!.titleKey)
      }))
  ];
  return places.map(place =>
    entry(
      [place.title, place.parent && place.parent + ' ' + place.title],
      `page:${place.route}?${place.query}`,
      place.title,
      place.parent || undefined,
      place.route,
      place.query
    )
  );
}
export function connectionEntries(connections: ConnectionList | undefined, t: Translator): SearchEntry[] {
  return connectionRows(connections).map(c =>
    entry([c.domain, c.dst, c.src], `connection:${c.id}`, c.domain || c.dst || c.src || c.id, chainLabel(c, t), 'connections', within('', {id: c.id}))
  );
}
export function nodeEntries(nodes: Node[] | undefined, providers: ProviderList | undefined, lang: Lang): SearchEntry[] {
  const listed = providers?.providers ?? [];
  // The nodes page filters by owner and name; the owner is the one the page files the node under.
  const nodeQuery = (node: Node) => within('', {provider: nodeOwner(node, listed), q: node.name});
  return (nodes ?? []).map(n => entry([n.name], `node:${n.id}`, n.name, formatList(lang, n.group_ids) || undefined, 'nodes', nodeQuery(n)));
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
    entry([source.path], `source:${source.id}`, source.path, t(sourceKinds[source.kind]), 'config', within('', {tab: 'source', source: source.id}))
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
export function searchSections(
  entries: Record<'pages' | 'conns' | 'nodes' | 'groups' | 'providers' | 'sources' | 'rules', SearchEntry[]>,
  connections: ConnectionList | undefined,
  t: Translator
): SearchIndex {
  return {
    sections: [
      {id: 'pages', title: t('search.pages'), entries: entries.pages},
      {id: 'conns', title: t('nav.connections'), entries: entries.conns},
      {id: 'nodes', title: t('search.nodes'), entries: entries.nodes},
      {id: 'groups', title: t('search.groups'), entries: entries.groups},
      {id: 'providers', title: t('search.providers'), entries: entries.providers},
      {id: 'sources', title: t('search.sources'), entries: entries.sources},
      {id: 'rules', title: t('nav.rules'), entries: entries.rules}
    ],
    partial: connections?.truncated ? t('conn.truncated') : null
  };
}
export function searchView(q: string, index: SearchIndex): SearchView {
  const needle = q.trim().toLowerCase();
  const limit = needle ? 8 : 5;
  const byId = new Map<string, SearchHit>();
  const sections = index.sections.map(section => {
    const items: SearchHit[] = [];
    for (const {hit, keys} of section.entries) {
      if (items.length === limit) break;
      if (!keys.some(key => key.includes(needle))) continue;
      items.push(hit);
      byId.set(hit.id, hit);
    }
    return {id: section.id, title: section.title, items};
  });
  return {sections: sections.filter(section => section.items.length > 0), byId, partial: index.partial};
}
