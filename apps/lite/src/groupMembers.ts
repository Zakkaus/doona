import type {Node, Provider} from '../../../src/api/model';
import {readNodeEntries} from '../../../src/dae/nodes';
import {readSubscriptionEntries} from '../../../src/dae/subscriptions';
import {quote} from '../../../src/dae/text';
import {linkInfo} from './config';
import {nodeBinding, subscriptionFilter, type Binding} from './groupBindings';

// Member choices for a group, as the draft would declare them: staged nodes and subscriptions
// are offered, and resources the draft removed are not.
export function memberOptions({
  original,
  content,
  nodes,
  providers,
  labels
}: {
  original: string;
  content: string;
  nodes: Node[];
  providers: Provider[];
  labels: {node: string; subscription: string};
}) {
  const inline = (node: Node) => providers.find(provider => provider.id === node.provider_id)?.kind === 'inline';
  const declaredNodes = readNodeEntries(content);
  const declaredSubscriptions = readSubscriptionEntries(content);
  const removedSubscriptions = readSubscriptionEntries(original)
    .filter(entry => !declaredSubscriptions.some(next => next.tag === entry.tag))
    .map(entry => entry.tag);
  const removedNodes = readNodeEntries(original)
    .filter(entry => !declaredNodes.some(next => next.name === entry.name))
    .map(entry => entry.name);
  const currentNodes = nodes.filter(node => !removedSubscriptions.includes(node.subscription_tag ?? '') && !(removedNodes.includes(node.name) && inline(node)));
  const addedNodes = declaredNodes.filter(entry => !currentNodes.some(node => node.name === entry.name && inline(node)));
  const options: Binding[] = [
    ...addedNodes.map(entry => ({
      id: `node:draft:${entry.name}`,
      label: entry.name,
      description: `${linkInfo(entry.link).protocol} / ${labels.node}`,
      filter: `!subtag(regex: '.*') && name(${quote(entry.name)})`
    })),
    ...declaredSubscriptions
      .filter(entry => !providers.some(provider => provider.name === entry.tag))
      .map(entry => ({
        id: `sub:draft:${entry.tag}`,
        label: entry.tag,
        description: labels.subscription,
        provider: `draft:${entry.tag}`,
        filter: subscriptionFilter(entry.tag, '')!
      })),
    ...providers
      .filter(item => item.kind === 'subscription' && !removedSubscriptions.includes(item.name))
      .map(item => ({id: `sub:${item.id}`, label: item.name, description: labels.subscription, provider: item.id, filter: subscriptionFilter(item.name, '')!})),
    ...currentNodes.map(item => nodeBinding(item, providers, labels.node))
  ];
  const matchable = [...currentNodes, ...addedNodes.map(entry => ({name: entry.name, subscription_tag: null}))];
  return {options, matchable};
}
