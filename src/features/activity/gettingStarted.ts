import type {ConfigSource, GroupSummary, Node, Provider} from '../../api/model';
import {healthMillis, noNodeSources, preferredHealth, pseudoOwner, resolveSelectedLeaf} from '../../api/selectors';
import {detectTemplate, isPresetRouting} from '../../dae/templates';

export function setupCompletion(
  nodes: Node[],
  sources: readonly Pick<ConfigSource, 'kind' | 'content'>[],
  groups: GroupSummary[],
  providers: readonly Pick<Provider, 'kind'>[]
) {
  const byName = new Map(groups.map(group => [group.name, group]));
  const byId = new Map(groups.map(group => [group.id, group]));
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const written = sources
    .filter(source => source.kind === 'main' || source.kind === 'include')
    .map(source => source.content ?? '')
    .join('\n');
  return {
    nodes: !noNodeSources(providers, nodes),
    // Untouched honk/demo routing is pending; templates, custom routing and preset option changes count as chosen.
    rules: detectTemplate(written) !== null || !isPresetRouting(written),
    connection: groups.some(group =>
      (['tcp', 'udp'] as const).some(network => {
        const node = resolveSelectedLeaf(group.name, network, byName, byId, nodesById).node;
        return !!node && pseudoOwner(node) !== 'builtin' && healthMillis(preferredHealth(node)) !== undefined;
      })
    )
  };
}
