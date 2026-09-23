import {useMemo, useState} from 'react';
import {useCapabilities, useNodes} from '../../store';
import {useT} from '../../i18n';
import {nodeView} from './view';
import {offered} from '../../api/capabilities';

export function useActivityNode() {
  const t = useT();
  const capabilities = useCapabilities();
  const nodes = useNodes(offered(capabilities.data?.resources, 'nodes', {whileLoading: false}));
  const [chosen, setChosen] = useState('');
  const view = useMemo(() => nodeView(nodes.data ?? [], chosen, t), [nodes.data, chosen, t]);
  // Nothing chosen yet: keep the node picked first, so a later poll does not switch the card to another node.
  if (!chosen && view.id) setChosen(view.id);
  return {...view, setChosen, loading: capabilities.loading || (nodes.loading && !nodes.data), error: nodes.error, retry: nodes.refetch};
}
