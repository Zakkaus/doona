import type {Translator} from '../i18n';
import {blockBody, scanConfig, quote, uncomment, type TextBlock} from './text';
import {readGroupEntries} from './groups';
import {templates, templateRules, templateGroupLabel, type TemplateOptions, type RuleTemplate} from './templates';

export const defaultGroup = 'proxy';
function routingBlock(group: string | null, rules: RuleTemplate, options: Partial<TemplateOptions>): string[] {
  // The header as written: the templates must route to the group the file already has. A replacer function keeps a `$` in
  // the name literal, where a replacement string would read `$&` as a pattern.
  const first = group ?? defaultGroup;
  const fill = (line: string) => '  ' + line.replaceAll('{group}', () => first);
  return ['routing {', ...templateRules(rules, options).map(fill), fill(`fallback: ${templates[rules].fallback}`), '}'];
}
// The DNS split a template can bring along: mainland names resolved by a mainland resolver, the rest over DNS over TLS.
const dnsUpstreams = {cloudflare: 'tls://1.1.1.1:853', alidns: 'udp://223.5.5.5:53'};
function dnsBlock(): string[] {
  return [
    'dns {',
    '  upstream {',
    `    cloudflare: ${quote(dnsUpstreams.cloudflare)}`,
    `    alidns: ${quote(dnsUpstreams.alidns)}`,
    '  }',
    '  routing {',
    '    request {',
    '      qname(geosite:cn) -> alidns',
    '      fallback: cloudflare',
    '    }',
    '  }',
    '}'
  ];
}
// Whether any of the texts holds a top-level `dns` block.
export function holdsDns(texts: string[]): boolean {
  return texts.some(text => scanConfig(text).blocks.some(block => block.name === 'dns'));
}
// Whether any of the texts holds a top-level `routing` block with more than comments in it.
export function holdsRouting(texts: string[]): boolean {
  return texts.some(text => scanConfig(text).blocks.some(block => block.name === 'routing' && blockBody(text, block).some(line => uncomment(line).trim())));
}

function groupLines(current: string[], rules: RuleTemplate, t: Translator): string[] {
  const have = new Set(current);
  const wanted = templates[rules].groups.filter(group => !have.has(group.name));
  if (!wanted.length && current.length) return [];
  if (!wanted.length) return [`  ${defaultGroup} { filter: !name('direct', 'block') policy: min_moving_avg }`];
  return wanted.flatMap(group => [`  # ${templateGroupLabel(group, t)}`, `  ${group.name} {`, ...group.lines.map(line => '    ' + line), '  }']);
}
// The groups a template adds beside `defined`, the names already declared as written: its own that are missing, or, for a template
// without groups, the default group when there is none at all.
export function templateGroups(rules: RuleTemplate, defined: string[]): string[] {
  const have = new Set(defined);
  const wanted = templates[rules].groups.filter(group => !have.has(group.name)).map(group => group.name);
  return wanted.length || defined.length ? wanted : [defaultGroup];
}
type Edit = {from: number; to: number; text: string};
// Adds the group lines to the file's last group section, or a new section at the end.
function addGroups(current: string, blocks: TextBlock[], missing: string[], edits: Edit[], appended: string[]) {
  const groupSection = blocks.find(block => block.name === 'group');
  if (!groupSection && missing.length) appended.push(['group {', ...missing, '}'].join('\n'));
  else if (groupSection && missing.length) {
    const at = current.lastIndexOf('\n', groupSection.close - 1) + 1;
    const inline = !/^[ \t]*$/.test(current.slice(at, groupSection.close));
    edits.push({from: inline ? groupSection.close : at, to: inline ? groupSection.close : at, text: (inline ? '\n' : '') + missing.join('\n') + '\n'});
  }
}
// Replaces every top-level routing block with one holding the template, or appends it; DNS routing is nested and stays.
function replaceRouting(blocks: TextBlock[], text: string, edits: Edit[], appended: string[]) {
  const routing = blocks.filter(block => block.name === 'routing');
  if (routing.length) routing.forEach((block, index) => edits.push({from: block.from, to: block.to, text: index === 0 ? text : ''}));
  else appended.push(text);
}
function applyEdits(current: string, edits: Edit[], appended: string[]): string {
  let out = current;
  for (const edit of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, edit.from) + edit.text + out.slice(edit.to);
  if (appended.length) out = out.replace(/\n$/, '') + '\n\n' + appended.join('\n\n') + '\n';
  return out;
}
// Applies a template to one file and nothing else in it: the template's missing groups join its group section and its
// rules replace the file's top-level routing. `defined` are the groups every loaded file declares, as written, so a
// group another file declares is reused rather than declared twice; `{group}` names the file's first group, or the
// first one declared anywhere. `dns` also appends the DNS split, for a configuration that has no `dns` block.
export function writeTemplate(
  current: string,
  rules: RuleTemplate,
  defined: Array<{name: string; written: string}>,
  {dns = false, t, ...options}: {dns?: boolean; t: Translator} & Partial<TemplateOptions>
): string {
  const {blocks} = scanConfig(current);
  const own = readGroupEntries(current);
  // honk keeps the quotes in a group's name, so only a group written as the template writes it is the same group.
  const names = [...own.map(entry => entry.written), ...defined.map(entry => entry.written)];
  const edits: Edit[] = [];
  const appended: string[] = [];
  addGroups(current, blocks, groupLines(names, rules, t), edits, appended);
  const group = own[0]?.written ?? defined[0]?.written ?? null;
  replaceRouting(blocks, routingBlock(group, rules, options).join('\n'), edits, appended);
  if (dns) appended.push(dnsBlock().join('\n'));
  return applyEdits(current, edits, appended);
}
