import type {ConfigSource} from '../../api/model';
import {conditionKinds, type RuleConditionKind} from '../../dae/groups';
import {scanConfig} from '../../dae/text';
import {readTag, tagId} from './taggedId';
import {href} from '../../shell/route';

// Where a rule sits in the rule list, when the backend lists rules and the reference names one.
export const ruleHref = (ruleId: string | null, listed: boolean) => (listed && ruleId ? href('rules', {tab: 'list', rule: ruleId}) : undefined);

// A condition a link prefills in the add-rule dialog of the routing list, or with `tab: 'dns'` of the DNS request list.
export type RuleSeed = {kind: RuleConditionKind; value: string};
export function parseRuleSeed(value: string | null, kinds: readonly RuleConditionKind[] = conditionKinds): RuleSeed | null {
  return value ? readTag(value, kinds) : null;
}
export function ruleSeedHref(seed: RuleSeed, tab: 'list' | 'dns' = 'list'): string {
  return href('rules', {tab, add: tagId(seed.kind, seed.value)});
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
