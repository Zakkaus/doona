import type {ConfigSource} from '../../api/model';
import type {Key, Translator} from '../../i18n';
import {scanConfig} from '../../dae/text';
import {allGroupNames, fileName} from '../../dae/sources';
import {classifyFilters, readGroupEntries, type GroupEntry} from '../../dae/groups';
import {defaultGroup, holdsDns, templateGroups, writeTemplate} from '../../dae/setup';
import {defaultTemplateOptions, detectTemplate, templates, templateGroupLabel, type TemplateOptions, type RuleTemplate} from '../../dae/templates';
import type {DiffRow} from '../../ui/ui';
import {lineDiff} from './diff';

// Templates that create groups are kept under More templates.
const primaryTemplates: RuleTemplate[] = ['bypass', 'gfw', 'global'];
const moreTemplates: RuleTemplate[] = ['single', 'services', 'regions', 'homebound'];
const templateText: Record<RuleTemplate, [Key, Key]> = {
  bypass: ['rule.template.bypass', 'rule.template.bypassHelp'],
  gfw: ['rule.template.gfw', 'rule.template.gfwHelp'],
  global: ['rule.template.global', 'rule.template.globalHelp'],
  single: ['rule.template.single', 'rule.template.singleHelp'],
  services: ['rule.template.services', 'rule.template.servicesHelp'],
  regions: ['rule.template.regions', 'rule.template.regionsHelp'],
  homebound: ['rule.template.homebound', 'rule.template.homeboundHelp']
};
export type TemplateChoice = {id: RuleTemplate; name: string; help: string};
export function templateChoice(id: RuleTemplate, t: Translator): TemplateChoice {
  const [name, help] = templateText[id];
  return {id, name: t(name), help: t(help, {groups: templates[id].groups.map(group => group.name).join(t('ui.listSeparator'))})};
}

export const templateOptionText = {
  blockAds: {label: 'rule.template.blockAds', help: 'rule.template.blockAdsHelp', on: 'rule.template.adsOn', off: 'rule.template.adsOff'},
  blockQuic: {label: 'rule.template.blockQuic', help: 'rule.template.blockQuicHelp', on: 'rule.template.quicOn', off: 'rule.template.quicOff'},
  networkManagerDirect: {
    label: 'rule.template.networkManagerDirect',
    help: 'rule.template.networkManagerDirectHelp',
    on: 'rule.template.networkManagerOn',
    off: 'rule.template.networkManagerOff'
  }
} as const satisfies Record<keyof TemplateOptions, Record<'label' | 'help' | 'on' | 'off', Key>>;
export const templateOptionKeys = Object.keys(templateOptionText) as (keyof TemplateOptions)[];

export type TemplateWrite = {after: string; diff: DiffRow[]};
// What applying a template writes to `source`, and the line diff against it; `withDns` also appends the DNS split, and
// is offered only while no loaded file has a `dns` block.
export function templateWrites(
  rules: RuleTemplate,
  source: ConfigSource,
  sources: ConfigSource[],
  t: Translator,
  options: Partial<TemplateOptions> = {}
): {plain: TemplateWrite; withDns: TemplateWrite | null} {
  const before = source.content!;
  const written = (dns: boolean): TemplateWrite => {
    const after = writeTemplate(before, rules, allGroupNames(sources), {dns, ...options, t});
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
function detectedTemplate(sources: ConfigSource[]) {
  const holders = routingSources(sources);
  return holders.length === 1 ? detectTemplate(holders[0].content!) : null;
}

export type TemplatesView = TemplateOptions & {current: TemplateChoice | null; primary: TemplateChoice[]; more: TemplateChoice[]};
export function templatesView(sources: ConfigSource[], t: Translator): TemplatesView {
  const detected = detectedTemplate(sources);
  const current = detected?.template;
  return {
    blockAds: detected?.blockAds ?? defaultTemplateOptions.blockAds,
    blockQuic: detected?.blockQuic ?? defaultTemplateOptions.blockQuic,
    networkManagerDirect: detected?.networkManagerDirect ?? defaultTemplateOptions.networkManagerDirect,
    current: current ? templateChoice(current, t) : null,
    primary: primaryTemplates.map(id => templateChoice(id, t)),
    more: moreTemplates.map(id => templateChoice(id, t))
  };
}

// Why a template cannot be applied, in the order a person would fix it.
export type TemplateRefusal = 'syntax' | 'writesOff' | 'noSource' | 'split' | 'secret' | 'readOnly' | 'incomplete' | 'denied';
const refusalText: Record<TemplateRefusal, Key> = {
  syntax: 'rule.template.refused.syntax',
  writesOff: 'rule.template.refused.writesOff',
  noSource: 'rule.template.refused.noSource',
  split: 'rule.template.refused.split',
  secret: 'rule.template.refused.secret',
  readOnly: 'rule.template.refused.readOnly',
  incomplete: 'rule.template.refused.incomplete',
  denied: 'rule.template.refused.denied'
};
// Paths as written in routing include statements; route targets named include are not statements.
function routingIncludes(text: string): string[] {
  const {blocks, tokens} = scanConfig(text);
  const paths: string[] = [];
  for (const block of blocks.filter(block => block.name === 'routing')) {
    const inside = tokens.filter(token => token.from > block.open && token.from < block.close && token.kind !== 'comment');
    // Count from routing's own brace: an unquoted path elsewhere can leave the scanner's count raised.
    let parens = 0;
    for (const [index, token] of inside.entries()) {
      const raw = text.slice(token.from, token.to);
      const next = inside[index + 1];
      if (
        token.kind === 'text' &&
        raw === 'include' &&
        parens === 0 &&
        (index === 0 || inside[index - 1].line !== token.line) &&
        next?.line === token.line &&
        text.slice(next.from, next.to) !== ':'
      ) {
        let end = index + 1;
        while (inside[end + 1]?.line === token.line) end++;
        paths.push(text.slice(next.from, inside[end].to));
      }
      if (token.kind === 'symbol' && raw === '(') parens++;
      else if (token.kind === 'symbol' && raw === ')') parens = Math.max(0, parens - 1);
    }
  }
  return [...new Set(paths)];
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
// one write: routing spread over files would need several writes that can fail halfway.
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
  // The groups the template declares, each with its translated label; the default group has none.
  created: Array<{name: string; label: string | null}>;
  // Groups the template's rules name that a file already declares, kept as they are.
  reused: Array<{name: string; pinned: boolean}>;
  // New groups named like a node: a rule naming one reaches the group rather than the node.
  collisions: string[];
  // Routing include paths whose rules the replacement stops applying; the files are kept.
  removedIncludes: string[];
};
// What applying `template` to `target` adds and relies on, given every loaded file and the node names.
export function templateImpact(template: RuleTemplate, target: ConfigSource, sources: ConfigSource[], nodes: string[], t: Translator): TemplateImpact {
  const entries = [target, ...sources.filter(source => source.id !== target.id)].flatMap(source => (source.content ? readGroupEntries(source.content) : []));
  // Groups are compared as written: honk keeps the quotes in a group's name, so `'proxy'` is not the template's `proxy`.
  const byName = new Map<string, GroupEntry>();
  for (const entry of entries) if (!byName.has(entry.written)) byName.set(entry.written, entry);
  const created = templateGroups(template, [...byName.keys()]);
  const labels = new Map(templates[template].groups.map(group => [group.name, templateGroupLabel(group, t)]));
  // A template without groups routes to the file's first group, or the first one declared anywhere.
  const named = templates[template].groups.length ? templates[template].groups.map(group => group.name) : [entries[0]?.written ?? defaultGroup];
  const taken = new Set(nodes);
  return {
    created: created.map(name => ({name, label: labels.get(name) ?? null})),
    reused: named.filter(name => byName.has(name)).map(name => ({name, pinned: pinned(byName.get(name)!)})),
    collisions: created.filter(name => taken.has(name)),
    removedIncludes: routingIncludes(target.content ?? '')
  };
}
