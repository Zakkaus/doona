import type {ConfigSource} from '../../api/model';
import type {Key, Translator} from '../../i18n';
import {scanConfig} from '../../dae/text';
import {allGroupNames, fileName} from '../../dae/sources';
import {classifyFilters, readGroupEntries, type GroupEntry} from '../../dae/groups';
import {defaultGroup, holdsDns, templateGroups, writeTemplate} from '../../dae/setup';
import {detectTemplate, templates, type RuleTemplate} from '../../dae/templates';
import type {DiffRow} from '../../ui/ui';
import {lineDiff} from './diff';

// The plain choices first; the ACL4SSR presets, which also create groups, are kept under More templates.
export const primaryTemplates: RuleTemplate[] = ['bypass', 'gfw', 'global'];
export const moreTemplates: RuleTemplate[] = ['mini', 'standard', 'full'];
const templateText: Record<RuleTemplate, [Key, Key]> = {
  bypass: ['rule.template.bypass', 'rule.template.bypassHelp'],
  gfw: ['rule.template.gfw', 'rule.template.gfwHelp'],
  global: ['rule.template.global', 'rule.template.globalHelp'],
  mini: ['rule.template.mini', 'rule.template.miniHelp'],
  standard: ['rule.template.standard', 'rule.template.standardHelp'],
  full: ['rule.template.full', 'rule.template.fullHelp']
};
export type TemplateChoice = {id: RuleTemplate; name: string; help: string};
export function templateChoice(id: RuleTemplate, t: Translator): TemplateChoice {
  const [name, help] = templateText[id];
  return {id, name: t(name), help: t(help, {groups: templates[id].groups.map(group => group.name).join(t('ui.listSeparator'))})};
}

export type TemplateWrite = {after: string; diff: DiffRow[]};
// What applying a template writes to `source`, and the line diff against it; `withDns` also appends the DNS split, and
// is offered only while no loaded file has a `dns` block.
export function templateWrites(
  rules: RuleTemplate,
  source: ConfigSource,
  sources: ConfigSource[],
  t: Translator
): {plain: TemplateWrite; withDns: TemplateWrite | null} {
  const before = source.content!;
  const written = (dns: boolean): TemplateWrite => {
    const after = writeTemplate(before, rules, allGroupNames(sources), {dns});
    return {
      after,
      diff: lineDiff(before, after).map(line => (line.kind === 'gap' ? {kind: 'gap', text: t('rule.template.unchanged', {n: line.count})} : line))
    };
  };
  return {plain: written(false), withDns: holdsDns(sources.map(item => item.content ?? '')) ? null : written(true)};
}

export type RuleViewMode = 'simple' | 'advanced';
// The params that point at one rule: a rule to select, a rule to edit, a condition to add, or held rules to review.
const ruleTargets = ['rule', 'edit', 'add', 'held'];
// The routing list's view: the one `view` names, else the rule table for a link to a rule and the simple view otherwise.
export function ruleViewMode(query: string): RuleViewMode {
  const params = new URLSearchParams(query);
  const asked = params.get('view');
  if (asked === 'simple' || asked === 'advanced') return asked;
  return ruleTargets.some(key => params.has(key)) ? 'advanced' : 'simple';
}

// The files a person writes whose top level holds a routing block; generated and subscription files hold none.
export function routingSources(sources: ConfigSource[]): ConfigSource[] {
  return sources.filter(
    source =>
      (source.kind === 'main' || source.kind === 'include') && !!source.content && scanConfig(source.content).blocks.some(block => block.name === 'routing')
  );
}

// The template the routing holds, when one file holds all of it; routing split over files is custom.
export function currentTemplate(sources: ConfigSource[]): RuleTemplate | null {
  const holders = routingSources(sources);
  return holders.length === 1 ? (detectTemplate(holders[0].content!)?.template ?? null) : null;
}

export type TemplatesView = {current: TemplateChoice | null; primary: TemplateChoice[]; more: TemplateChoice[]};
export function templatesView(sources: ConfigSource[], t: Translator): TemplatesView {
  const current = currentTemplate(sources);
  return {
    current: current && templateChoice(current, t),
    primary: primaryTemplates.map(id => templateChoice(id, t)),
    more: moreTemplates.map(id => templateChoice(id, t))
  };
}

// Why a template cannot be applied, in the order a person would fix it.
export type TemplateRefusal = 'syntax' | 'writesOff' | 'noSource' | 'split' | 'include' | 'secret' | 'readOnly' | 'incomplete' | 'denied';
const refusalText: Record<TemplateRefusal, Key> = {
  syntax: 'rule.template.refused.syntax',
  writesOff: 'rule.template.refused.writesOff',
  noSource: 'rule.template.refused.noSource',
  split: 'rule.template.refused.split',
  include: 'rule.template.refused.include',
  secret: 'rule.template.refused.secret',
  readOnly: 'rule.template.refused.readOnly',
  incomplete: 'rule.template.refused.incomplete',
  denied: 'rule.template.refused.denied'
};
// Whether a routing block of `text` pulls in another file with an `include` statement, whose rules a replacement would
// drop. Only a statement's first word is one: `fallback: include` and `-> include` name a group called include.
function routingIncludes(text: string): boolean {
  const {blocks, tokens} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'routing')
    .some(block => {
      const inside = tokens.filter(token => token.from > block.open && token.from < block.close && token.kind !== 'comment');
      return inside.some(
        (token, index) =>
          token.kind === 'text' &&
          token.parens === 0 &&
          text.slice(token.from, token.to) === 'include' &&
          (index === 0 || inside[index - 1].line !== token.line) &&
          text.slice(inside[index + 1]?.from, inside[index + 1]?.to) !== ':'
      );
    });
}
export type TemplateTargetInput = {
  sources: ConfigSource[];
  configWritable: boolean;
  daeText: boolean;
  // Whether a source's text matches its digest; undefined until checked.
  complete: (source: ConfigSource) => boolean | undefined;
  holdsCredentials: (source: ConfigSource) => boolean;
  // The backend refused a write of this file as not permitted.
  denied: string | null;
};
// The one file a template replaces the routing of, or why none can be written. A template rewrites a single file in
// one write: routing spread over files, or pulling one in, would need several writes that can fail halfway.
export function templateTarget({sources, configWritable, daeText, complete, holdsCredentials, denied}: TemplateTargetInput): {
  source: ConfigSource | null;
  refusal: TemplateRefusal | null;
} {
  const holders = routingSources(sources);
  const source = holders[0] ?? sources.find(item => item.kind === 'main') ?? null;
  const refusal: TemplateRefusal | null = !daeText
    ? 'syntax'
    : !configWritable
      ? 'writesOff'
      : !source
        ? 'noSource'
        : holders.length > 1
          ? 'split'
          : source.content !== undefined && routingIncludes(source.content)
            ? 'include'
            : source.content !== undefined && holdsCredentials(source)
              ? 'secret'
              : !source.writable
                ? 'readOnly'
                : complete(source) === false || source.content === undefined
                  ? 'incomplete'
                  : denied === source.id
                    ? 'denied'
                    : null;
  return {source, refusal};
}
export const refusalReason = (refusal: TemplateRefusal, source: ConfigSource | null, t: Translator) =>
  t(refusalText[refusal], {file: source ? fileName(source) : ''});

// A group pinned to one node: one exact name and nothing else, or a fixed policy. Every rule a template points at it
// then leaves through that one node.
const pinned = (entry: GroupEntry) => {
  const {names, subtags, rules} = classifyFilters(entry);
  return (names.length === 1 && !subtags.length && !rules.length) || /^fixed\b/.test(entry.policy ?? '');
};
export type TemplateImpact = {
  // The groups the template declares, each with its ACL4SSR label; the default group has none.
  created: Array<{name: string; label: string | null}>;
  // Groups the template's rules name that a file already declares, kept as they are.
  reused: Array<{name: string; pinned: boolean}>;
  // New groups named like a node: a rule naming one reaches the group rather than the node.
  collisions: string[];
};
// What applying `template` to `target` adds and relies on, given every loaded file and the node names.
export function templateImpact(template: RuleTemplate, target: ConfigSource, sources: ConfigSource[], nodes: string[]): TemplateImpact {
  const entries = [target, ...sources.filter(source => source.id !== target.id)].flatMap(source => (source.content ? readGroupEntries(source.content) : []));
  // Groups are compared as written: honk keeps the quotes in a group's name, so `'proxy'` is not the template's `proxy`.
  const byName = new Map<string, GroupEntry>();
  for (const entry of entries) if (!byName.has(entry.written)) byName.set(entry.written, entry);
  const created = templateGroups(template, [...byName.keys()]);
  const labels = new Map(templates[template].groups.map(group => [group.name, group.label]));
  // A template without groups routes to the file's first group, or the first one declared anywhere.
  const named = templates[template].groups.length ? templates[template].groups.map(group => group.name) : [entries[0]?.written ?? defaultGroup];
  const taken = new Set(nodes);
  return {
    created: created.map(name => ({name, label: labels.get(name) ?? null})),
    reused: named.filter(name => byName.has(name)).map(name => ({name, pinned: pinned(byName.get(name)!)})),
    collisions: created.filter(name => taken.has(name))
  };
}
