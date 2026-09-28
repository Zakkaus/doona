import {useMemo, useState} from 'react';
import {useCapabilities, useNodes, useProviders} from '../../store';
import {useT} from '../../i18n';
import {nodeView} from './view';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';

export function useActivityNode() {
  const t = useT();
  const capabilities = useCapabilities();
  const nodes = useNodes(offered(capabilities.data?.resources, 'nodes', {whileLoading: false}));
  const [chosen, setChosen] = useState('');
  const view = useMemo(() => nodeView(nodes.data ?? [], chosen, t), [nodes.data, chosen, t]);
  // Nothing chosen yet: keep the node picked first, so a later poll does not switch the card to another node.
  if (!chosen && view.id) setChosen(view.id);
  const node = nodes.data?.find(item => item.id === view.id);
  // Only a node without a provider needs the list, to spell the stand-in owner the nodes page files it under.
  const providers = useProviders(!!node && node.provider_id == null && offered(capabilities.data?.resources, 'providers', {whileLoading: false}));
  const href = node ? nodeHref(node, providers.data?.providers ?? []) : undefined;
  return {...view, href, setChosen, loading: capabilities.loading || (nodes.loading && !nodes.data), error: nodes.error, retry: nodes.refetch};
}
