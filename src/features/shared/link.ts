import type {ConfigSource, Node} from '../../api/model';
import {nodeOwner} from '../../api/selectors';
import {conditionKinds, type RuleConditionKind} from '../../dae/groups';
import {scanConfig} from '../../dae/text';
import {readTag} from './taggedId';
import {href, within} from '../../shell/route';

// Where a rule sits in the rule list, when the backend lists rules and the reference names one.
export const ruleHref = (ruleId: string | null, listed: boolean) => (listed && ruleId ? href('rules', {tab: 'list', rule: ruleId}) : undefined);

// A node on the Nodes page: under the owner the page files it under, found by its name.
export const nodeHref = (node: Pick<Node, 'provider_id' | 'protocol' | 'name'>, providers: ReadonlyArray<{id: string}>) =>
  href('nodes', {provider: nodeOwner(node, providers), q: node.name});

// The Policies page focuses a group by the id the backend gives it, which a group written by name does not carry. A
// group the list does not hold opens the page without a focus.
export function groupQuery(groups: ReadonlyArray<{id: string; name: string}> | undefined, name: string): string {
  const id = groups?.find(group => group.name === name)?.id;
  return id ? within('', {group: id}) : '';
}

// The routing trace with its form filled in from a link: the target, and the source and process when the link knows
// them. The person runs the trace.
export type TraceLink = {network: 'tcp' | 'udp'; domain: string; dst_ip: string; dst_port: string; src_ip: string; src_port: string; pname: string};
const traceKeys = ['network', 'domain', 'dst_ip', 'dst_port', 'src_ip', 'src_port', 'pname'] as const;
export const traceQuery = (link: Partial<TraceLink>) => within('', {tab: 'trace', ...Object.fromEntries(traceKeys.map(key => [key, link[key] || null]))});
// Null when the link names no target, so a plain visit to the tab keeps what was typed.
export function parseTraceLink(query: string): TraceLink | null {
  const params = new URLSearchParams(query);
  const value = (key: (typeof traceKeys)[number]) => params.get(key) ?? '';
  if (!value('domain') && !value('dst_ip')) return null;
  return {
    network: value('network') === 'udp' ? 'udp' : 'tcp',
    domain: value('domain'),
    dst_ip: value('dst_ip'),
    dst_port: value('dst_port'),
    src_ip: value('src_ip'),
    src_port: value('src_port'),
    pname: value('pname')
  };
}

// The Settings card holding what the backend records and keeps: log level, flow and DNS recording, retention.
export const recordingSettingsHref = href('settings', {card: 'runtime'});

// A condition a link prefills in the add-rule dialog of the routing list, or with `tab: 'dns'` of the DNS request list.
export type RuleSeed = {kind: RuleConditionKind; value: string};
export function parseRuleSeed(value: string | null, kinds: readonly RuleConditionKind[] = conditionKinds): RuleSeed | null {
  return value ? readTag(value, kinds) : null;
}

// The Sources tab at the first line of the first top-level `name { … }` section the main file or an include holds, as
// the Modules tab lists it. Without one it opens the main file, where such a section would be added.
export function sectionSourceHref(sources: readonly ConfigSource[], name: string): string {
  const authored = sources.filter(source => source.kind === 'main' || source.kind === 'include');
  for (const source of authored) {
    const block = source.content === undefined ? undefined : scanConfig(source.content).blocks.find(block => block.name === name);
    if (block) return href('config', {tab: 'source', source: source.id, line: String(block.line + 1)});
  }
  return href('config', {tab: 'source', source: authored.find(source => source.kind === 'main')?.id ?? null});
}
