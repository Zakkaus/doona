import type {Node, Provider} from '../../../../src/api/model';

export function nodeOrigin(node: Node | undefined, providers: readonly Provider[], manual: string): string {
  const provider = providers.find(item => item.id === node?.provider_id);
  return provider?.kind === 'subscription' ? node?.subscription_tag || provider.name : manual;
}
