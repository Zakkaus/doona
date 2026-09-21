import {useState} from 'react';
import type {Key} from 'react-aria-components';
import {useT} from '../../i18n';
import {useCapabilities, useConfig, useConnections, useGroups, useNodes, useProviders, useRules} from '../../api/store';
import type {PageProps} from '../../features/types';
import {searchView} from './view';

export function useSearch(go: PageProps['go'], onClose: () => void) {
  const t = useT();
  const [q, setQ] = useState('');
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const connections = useConnections(undefined, resources?.connections.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const providers = useProviders(resources?.providers.available === true);
  const config = useConfig(resources?.config.available === true);
  const rules = useRules(resources?.rules.available === true);
  const sources = [capabilities, connections, nodes, groups, providers, config, rules];
  const view = searchView(q, {capabilities, connections, nodes, groups, providers, config, rules}, t);
  return {
    q,
    setQ,
    sections: view.sections,
    empty: view.byId.size === 0,
    error: sources.find(source => source.error)?.error,
    loading: sources.some(source => source.loading && !source.data),
    select: (id: Key) => {
      const item = view.byId.get(String(id));
      if (!item) return;
      go(item.route, item.query);
      onClose();
    }
  };
}
