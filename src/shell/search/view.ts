import type {Capabilities, ConnectionList, Node, GroupSummary, ProviderList, EffectiveConfig, RuleList} from '../../api/model';
import type {Translator} from '../../i18n';
import {chainLabel, connectionRows} from '../../api/selectors';
import {features, navAvailable, subpages} from '../registry';

export type SearchHit = {id: string; label: string; description: string | undefined; route: string; query: string};
export type SearchView = {sections: Array<{id: string; title: string; items: SearchHit[]}>; byId: Map<string, SearchHit>};
export type SearchSources = {
  capabilities: {data: Capabilities | undefined};
  connections: {data: ConnectionList | undefined};
  nodes: {data: Node[] | undefined};
  groups: {data: GroupSummary[] | undefined};
  providers: {data: ProviderList | undefined};
  config: {data: EffectiveConfig | undefined};
  rules: {data: RuleList | undefined};
};
export function searchView(q: string, {capabilities, connections, nodes, groups, providers, config, rules}: SearchSources, t: Translator): SearchView {
  const needle = q.trim().toLowerCase();
  const limit = needle ? 8 : 5;
  const match = (...values: Array<string | null | undefined>) => values.some(value => value?.toLowerCase().includes(needle));
  const available = (path: string) => navAvailable(path, capabilities.data);
  const byId = new Map<string, SearchHit>();
  const hit = (id: string, label: string, description: string | undefined, route: string, query = ''): SearchHit => {
    const item = {id, label, description, route, query};
    byId.set(item.id, item);
    return item;
  };
  const places = [
    ...features
      .filter(feature => feature.nav && available(feature.path))
      .map(feature => ({route: feature.path, query: '', title: t(feature.nav!.titleKey), parent: ''})),
    ...subpages
      .filter(item => available(item.path))
      .map(item => ({route: item.path, query: item.query, title: t(item.titleKey), parent: t(features.find(f => f.path === item.path)!.nav!.titleKey)}))
  ];
  const sections = [
    {
      id: 'pages',
      title: t('search.pages'),
      items: places
        .filter(place => match(place.title, place.parent && place.parent + ' ' + place.title))
        .slice(0, limit)
        .map(place => hit(`page:${place.route}?${place.query}`, place.title, place.parent || undefined, place.route, place.query))
    },
    {
      id: 'conns',
      title: t('nav.connections'),
      items: connectionRows(connections.data)
        .filter(c => match(c.domain, c.dst, c.src))
        .slice(0, limit)
        .map(c => hit(`connection:${c.id}`, c.domain || c.dst || c.src || c.id, chainLabel(c, t), 'connections', 'id=' + encodeURIComponent(c.id)))
    },
    {
      id: 'nodes',
      title: t('search.nodes'),
      items: (nodes.data ?? [])
        .filter(n => match(n.name))
        .slice(0, limit)
        .map(n =>
          hit(
            `node:${n.id}`,
            n.name,
            n.group_ids.join(', ') || undefined,
            'nodes',
            (n.provider_id ? 'provider=' + encodeURIComponent(n.provider_id) + '&' : '') + 'q=' + encodeURIComponent(n.name)
          )
        )
    },
    {
      id: 'groups',
      title: t('search.groups'),
      items: (groups.data ?? [])
        .filter(g => match(g.name))
        .slice(0, limit)
        .map(g => hit(`group:${g.id}`, g.name, g.policy.native, 'policies', 'group=' + encodeURIComponent(g.id)))
    },
    {
      id: 'providers',
      title: t('search.providers'),
      items: (providers.data?.providers ?? [])
        .filter(p => match(p.name))
        .slice(0, limit)
        .map(p => hit(`provider:${p.id}`, p.name, t('search.nodeCount', {n: p.node_count}), 'nodes', 'provider=' + encodeURIComponent(p.id)))
    },
    {
      id: 'sources',
      title: t('search.sources'),
      items: (config.data?.sources ?? [])
        .filter(source => match(source.path))
        .slice(0, limit)
        .map(source => hit(`source:${source.id}`, source.path, source.kind, 'config', 'tab=source&source=' + encodeURIComponent(source.id)))
    },
    {
      id: 'rules',
      title: t('nav.rules'),
      items: (rules.data?.rules ?? [])
        .filter(rule => rule.kind === 'rule' && match(rule.expression, rule.outbound))
        .slice(0, limit)
        .map(rule =>
          hit(`rule:${rule.rule_id}`, rule.expression, `#${rule.index + 1} → ${rule.outbound}`, 'rules', 'tab=list&rule=' + encodeURIComponent(rule.rule_id))
        )
    }
  ];
  return {sections: sections.filter(section => section.items.length > 0), byId};
}
