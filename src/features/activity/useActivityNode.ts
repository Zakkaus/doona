import {useMemo, useState} from 'react';
import {useCapabilities, useNodes} from '../../store';
import {useT} from '../../i18n';
import {nodeView} from './view';

export function useActivityNode() {
  const t = useT();
  const capabilities = useCapabilities();
  const nodes = useNodes(capabilities.data?.resources.nodes.available === true);
  const [chosen, setChosen] = useState('');
  const view = useMemo(() => nodeView(nodes.data ?? [], chosen, t), [nodes.data, chosen, t]);
  // Nothing chosen yet: keep the node picked first, so a later poll does not switch the card to another node.
  if (!chosen && view.id) setChosen(view.id);
  return {...view, setChosen, loading: capabilities.loading || (nodes.loading && !nodes.data), error: nodes.error, retry: nodes.refetch};
}
