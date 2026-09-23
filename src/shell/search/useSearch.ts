import {useMemo, useState} from 'react';
import type {Key} from 'react-aria-components';
import {useLang, useT} from '../../i18n';
import {useCapabilities, useConfig, useConnections, useGroups, useNodes, useProviders, useRules} from '../../store';
import type {PageProps} from '../routes';
import {connectionEntries, groupEntries, nodeEntries, pageEntries, providerEntries, ruleEntries, searchSections, searchView, sourceEntries} from './view';
import {offered} from '../../api/capabilities';

export function useSearch(go: PageProps['go'], onClose: () => void) {
  const t = useT();
  const lang = useLang();
  const [q, setQ] = useState('');
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const connections = useConnections(undefined, offered(resources, 'connections', {whileLoading: false}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const providers = useProviders(offered(resources, 'providers', {whileLoading: false}));
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const rules = useRules(offered(resources, 'rules', {whileLoading: false}));
  const sources = [capabilities, connections, nodes, groups, providers, config, rules];
  // Each dataset is projected on its own data, so a keystroke only filters and a poll re-projects one dataset.
  const pages = useMemo(() => pageEntries(capabilities.data, config.data, t), [capabilities.data, config.data, t]);
  const conns = useMemo(() => connectionEntries(connections.data, t), [connections.data, t]);
  const nodeHits = useMemo(() => nodeEntries(nodes.data, providers.data, lang, t), [nodes.data, providers.data, lang, t]);
  const groupHits = useMemo(() => groupEntries(groups.data), [groups.data]);
  const providerHits = useMemo(() => providerEntries(providers.data, t), [providers.data, t]);
  const sourceHits = useMemo(() => sourceEntries(config.data, t), [config.data, t]);
  const ruleHits = useMemo(() => ruleEntries(rules.data, lang), [rules.data, lang]);
  const view = searchView(
    q,
    searchSections({pages, conns, nodes: nodeHits, groups: groupHits, providers: providerHits, sources: sourceHits, rules: ruleHits}, connections.data, t)
  );
  return {
    q,
    setQ,
    sections: view.sections,
    partial: view.partial,
    openConnections: () => {
      go('connections');
      onClose();
    },
    empty: view.byId.size === 0,
    error: sources.find(source => source.error)?.error,
    retry: () => sources.forEach(source => source.error && source.refetch()),
    loading: sources.some(source => source.loading && !source.data),
    select: (id: Key) => {
      const item = view.byId.get(String(id));
      if (!item) return;
      go(item.route, item.query);
      onClose();
    }
  };
}
