import type {ConfigSource, GroupSummary, Node, Provider} from '../../../src/api/model';
import {blockFields, scanConfig, unquote} from '../../../src/dae/text';
import {findBlocks, parseRuleList} from './ruleDraft';
import type {SearchTarget} from './ui/commands';
import {regions} from '../../../src/dae/regions';
import {regionOf} from './regions';

// A name that mentions a region also answers to that region's other names, in every script (japan finds 日本).
function regionTerms(name: string): string[] {
  const iso = regionOf(name);
  const entry = iso ? regions.find(([code]) => code === iso) : undefined;
  if (!iso || !entry) return [];
  const display = ['en', 'zh-CN', 'zh-TW'].map(locale => new Intl.DisplayNames([locale], {type: 'region'}).of(iso) ?? '');
  return [...new Set([iso, ...entry[1], ...Object.values(entry[2]?.short ?? {}), ...(entry[2]?.official ?? []), ...display].filter(Boolean) as string[])];
}
export type ResourceResult = {
  id: string;
  label: string;
  description: string;
  target: SearchTarget;
  category: 'nodes' | 'groups' | 'subscriptions' | 'routing' | 'dns';
  preview?: string;
  keywords?: string[];
  rule?: {
    conditions: Array<{kind: string; value: string; negate: boolean}> | null;
    target: string;
    fallback: boolean;
    kind: 'routing' | 'request' | 'response';
  };
};
export function resourceIndex(nodes: Node[], groups: GroupSummary[], providers: Provider[], sources: ConfigSource[], manualLabel: string): ResourceResult[] {
  const result: ResourceResult[] = [
    ...groups.map(group => ({
      id: `group:${group.id}`,
      label: group.name,
      description: group.policy.native || group.policy.kind,
      category: 'groups' as const,
      keywords: regionTerms(group.name),
      target: {kind: 'group' as const, id: group.id}
    })),
    ...nodes.map(node => {
      const provider = providers.find(provider => provider.id === node.provider_id);
      return {
        id: `node:${node.id}`,
        label: node.name || node.id,
        description: [node.protocol, provider?.kind === 'inline' ? manualLabel : provider?.name].filter(Boolean).join(' / '),
        category: 'nodes' as const,
        keywords: regionTerms(node.name || node.id),
        target: {kind: 'node' as const, id: node.id}
      };
    }),
    ...providers
      .filter(provider => provider.kind === 'subscription')
      .map(provider => ({
        id: `subscription:${provider.id}`,
        label: provider.name,
        description: String(provider.node_count),
        category: 'subscriptions' as const,
        target: {kind: 'subscription' as const, id: provider.id}
      }))
  ];
  // Included sources are searchable but open a read-only preview.
  for (const source of sources) {
    for (const kind of ['routing', 'request', 'response'] as const) {
      for (const row of parseRuleList(source.content, kind).rows)
        result.push({
          id: `${source.id}:${kind}:${row.anchor.from}`,
          label: row.fallback ? `fallback: ${row.target}` : `${row.expression} → ${row.target}`,
          description: [row.note, source.kind === 'main' ? '' : source.path].filter(Boolean).join(' / '),
          preview: source.kind === 'main' ? undefined : row.anchor.text,
          keywords: [row.expression, row.target],
          rule: {conditions: row.conditions, target: row.target, fallback: row.fallback, kind},
          category: kind === 'routing' ? 'routing' : 'dns',
          target: {kind: 'rule', ruleKind: kind, id: row.anchor.text}
        });
    }
    for (const block of findBlocks(source.content, ['dns', 'upstream']))
      for (const field of blockFields(source.content, block, scanConfig(source.content).tokens))
        result.push({
          id: `${source.id}:upstream:${field.name}`,
          label: field.name,
          description: unquote(field.value),
          preview: source.kind === 'main' ? undefined : `${field.name}: ${field.value}`,
          category: 'dns',
          target: {kind: 'upstream', id: field.name}
        });
  }
  return result;
}

export function searchNameRank(label: string, query: string): number {
  const name = label.toLocaleLowerCase();
  const text = query.trim().toLocaleLowerCase();
  return !text || name === text ? 0 : name.startsWith(text) ? 1 : name.includes(text) ? 2 : 3;
}
