import {blockFields, isBareName, isFragment, isQuotable, quote, scanConfig, unquote, type TextBlock, type TextField} from './text';
import {isBuiltinOutbound} from './vocab';

export type GroupEntry = {
  name: string;
  // The header as written, quotes included: honk names the group by this text, so `->` must repeat it verbatim.
  written: string;
  filters: string[];
  policy: string | null;
  // `default` and `final` as written, quotes included, or null when the entry sets none.
  default: string | null;
  final: string | null;
  interrupt: string | null;
  from: number;
  to: number;
};

export function readGroupEntries(text: string): GroupEntry[] {
  const {blocks, tokens} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'group')
    .flatMap(block =>
      block.children.map(entry => {
        const fields = blockFields(text, entry, tokens);
        const head = tokens.find(token => token.from === entry.from);
        const last = (name: string) => fields.filter(field => field.name === name).at(-1)?.value ?? null;
        return {
          name: entry.name,
          written: head ? text.slice(head.from, head.to) : entry.name,
          filters: fields.filter(field => field.name === 'filter').map(field => field.value),
          policy: last('policy'),
          default: last('default'),
          final: last('final'),
          interrupt: last('interrupt_connections'),
          from: entry.line,
          to: entry.endLine
        };
      })
    );
}

export const quoteName = (value: string) => (isBareName(value) ? value : quote(value));
export const isWritableName = (value: string) => isBareName(value) || isQuotable(value);

// doona creates groups only under bare names, so a new name never needs quoting where filters or rules cite it.
export function groupNameProblem(name: string, taken: ReadonlySet<string>): 'invalid' | 'taken' | null {
  return !isBareName(name) ? 'invalid' : taken.has(name) ? 'taken' : null;
}

// Optional fields are written as given; undefined leaves the line alone and null removes it.
export type GroupEntryUpdate = {filters: string[]; policy: string | null; default?: string | null; final?: string | null; interrupt?: string | null};
export function writeGroupEntry(text: string, name: string, next: GroupEntryUpdate): string {
  const {blocks, tokens} = scanConfig(text);
  const sections = blocks.filter(block => block.name === 'group');
  const entry = sections.flatMap(block => block.children).find(entry => entry.name === name);
  if (entry) {
    const current = readGroupEntries(text).find(group => group.name === name)!;
    if (
      current.filters.length === next.filters.length &&
      current.filters.every((filter, i) => filter === next.filters[i]) &&
      current.policy === next.policy &&
      (['default', 'final', 'interrupt'] as const).every(key => next[key] === undefined || next[key] === current[key])
    )
      return text;
    const lineStart = text.lastIndexOf('\n', entry.from - 1) + 1;
    const prefix = text.slice(lineStart, entry.from);
    const indent = /^\s*$/.test(prefix) ? prefix : '  ';
    const fields = blockFields(text, entry, tokens);
    const bodyStart = entry.open + 1;
    const old = text.slice(bodyStart, entry.close);
    const inner = old.match(/\n([ \t]+)\S/)?.[1] ?? indent + (indent || '    ');
    if (entry.line !== entry.endLine) return rewriteFields(text, entry, fields, inner, next);
    // A one-line entry is spread over lines, one field per line in its own order, and then edited like any other.
    const starts = [bodyStart, ...fields.map(field => field.from), entry.close];
    const lines = starts.slice(0, -1).flatMap((from, i) => {
      const line = text.slice(from, starts[i + 1]).trim();
      return line ? [inner + line] : [];
    });
    return writeGroupEntry(text.slice(0, bodyStart) + '\n' + lines.map(line => line + '\n').join('') + indent + text.slice(entry.close), name, next);
  }
  const block = sections.at(-1);
  const indent = block ? (text.slice(block.open + 1, block.close).match(/\n([ \t]+)\S/)?.[1] ?? '    ') : '    ';
  const body = [
    `${indent}${quoteName(name)} {`,
    ...next.filters.map(filter => `${indent}${indent}filter: ${filter}`),
    ...(next.policy ? [`${indent}${indent}policy: ${next.policy}`] : []),
    ...(next.default ? [`${indent}${indent}default: ${next.default}`] : []),
    ...(next.final ? [`${indent}${indent}final: ${next.final}`] : []),
    ...(next.interrupt ? [`${indent}${indent}interrupt_connections: ${next.interrupt}`] : []),
    `${indent}}`
  ].join('\n');
  if (block) {
    const closeLine = text.lastIndexOf('\n', block.close - 1) + 1;
    const at = /^[ \t]*$/.test(text.slice(closeLine, block.close)) ? closeLine : block.close;
    return text.slice(0, at) + (text[at - 1] === '\n' ? '' : '\n') + body + '\n' + text.slice(at);
  }
  return `${text.replace(/\n+$/, '')}\n\ngroup {\n${body}\n}\n`;
}

// Changes fields where they stand, so comments and other fields keep their place.
// A new line goes after the last line of its own key or of a key listed before it, in the order a group is written.
const singleKeys = ['policy', 'default', 'final', 'interrupt'] as const;
const fieldName = (key: (typeof singleKeys)[number]) => (key === 'interrupt' ? 'interrupt_connections' : key);
function rewriteFields(text: string, entry: TextBlock, fields: TextField[], inner: string, next: GroupEntryUpdate): string {
  const filters = fields.filter(field => field.name === 'filter');
  const edits: Array<{from: number; to: number; text: string}> = [];
  const lineEnd = (at: number) => text.indexOf('\n', at) + 1;
  const remove = (field: TextField) => {
    const start = text.lastIndexOf('\n', field.from - 1) + 1;
    const end = lineEnd(field.to);
    const whole = /^[ \t\r]*$/.test(text.slice(start, field.from)) && end > 0 && /^[ \t\r]*$/.test(text.slice(field.to, end - 1));
    edits.push(whole ? {from: start, to: end, text: ''} : {from: field.from, to: field.to, text: ''});
  };
  const replace = (field: TextField, value: string) => {
    if (field.value === value) return;
    const lead = /^\s*/.exec(text.slice(field.valueFrom, field.valueTo))![0];
    edits.push({from: field.valueFrom + lead.length, to: field.valueTo, text: (lead ? '' : ' ') + value});
  };
  const beforeField = (field: TextField) => {
    const start = text.lastIndexOf('\n', field.from - 1) + 1;
    return /^[ \t]*$/.test(text.slice(start, field.from)) ? start : field.from;
  };
  const added = new Map<number, string>();
  const add = (at: number, line: string) => added.set(at, (added.get(at) ?? '') + line);
  // Filters go after the last filter, or before the policy line, or first in the body.
  const policies = fields.filter(field => field.name === 'policy');
  const afterField = (at: number) => {
    const end = lineEnd(at);
    return end > 0 && end <= entry.close ? end : at;
  };
  const filterAt = filters.length ? afterField(filters.at(-1)!.to) : policies.length ? beforeField(policies[0]) : afterField(entry.open + 1);
  // Unchanged filters anchor each edit so removing an earlier line never moves their comments or formatting.
  const changeFilters = (from: number, to: number, values: string[], at: number) => {
    filters.slice(from, to).forEach((field, i) => (i < values.length ? replace(field, values[i]) : remove(field)));
    for (const value of values.slice(to - from)) add(at, `${inner}filter: ${value}\n`);
  };
  let oldFrom = 0;
  let newFrom = 0;
  next.filters.forEach((value, i) => {
    const at = filters.findIndex((field, index) => index >= oldFrom && field.value === value);
    if (at < 0) return;
    changeFilters(oldFrom, at, next.filters.slice(newFrom, i), beforeField(filters[at]));
    oldFrom = at + 1;
    newFrom = i + 1;
  });
  changeFilters(oldFrom, filters.length, next.filters.slice(newFrom), filterAt);
  singleKeys.forEach((key, i) => {
    const value = next[key];
    if (value === undefined) return;
    const own = fields.filter(field => field.name === fieldName(key));
    own.slice(0, -1).forEach(remove);
    if (own.length) {
      if (value) replace(own.at(-1)!, value);
      else remove(own.at(-1)!);
      return;
    }
    if (!value) return;
    if (key === 'policy') return add(filterAt, `${inner}policy: ${value}\n`);
    const before = fields.filter(field => field.name === 'filter' || singleKeys.slice(0, i).some(key => field.name === fieldName(key))).at(-1);
    add(before ? afterField(before.to) : afterField(entry.open + 1), `${inner}${fieldName(key)}: ${value}\n`);
  });
  for (const [at, lines] of added) {
    const inline = at > entry.open && text[at - 1] !== '\n' && !/^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', at - 1) + 1, at));
    edits.push({from: at, to: at, text: inline ? '\n' + lines + inner : lines});
  }
  return edits.sort((a, b) => b.from - a.from || b.to - a.to).reduce((out, edit) => out.slice(0, edit.from) + edit.text + out.slice(edit.to), text);
}

// A name as `default` or `final` takes it: as written when it still names the same value, otherwise quoted as needed.
export function nameText(value: string | null, written: string | null): string | null {
  if (value === null) return null;
  return written !== null && unquote(written) === value ? written : quoteName(value);
}

// The groups an entry nests through `filter: group(...)`, which takes comma-separated arguments and `|`-separated tags.
export function nestedIn(entry: Pick<GroupEntry, 'filters'>): string[] {
  return entry.filters.flatMap(filter =>
    splitTop(filter, '&&').flatMap(term =>
      term.startsWith('group(') && term.endsWith(')')
        ? splitTop(term.slice(6, -1), ',').flatMap(argument =>
            unquote(argument)
              .split(/[|,]/)
              .map(tag => tag.trim())
              .filter(Boolean)
          )
        : []
    )
  );
}

// Only a filter line that is exactly one plain call can be extended without changing filter semantics: filter
// lines combine with OR, so adding a value to `name(a, b)` admits one more node and nothing else, while a line
// with `&&`, `!`, `keyword:` or `regex:` would change meaning.
export type ExactCall = 'name' | 'subtag';
export function exactTokens(filter: string, call: ExactCall | 'group'): string[] | null {
  const tokens = scanConfig(filter).tokens;
  const raw = tokens.map(token => filter.slice(token.from, token.to));
  if (tokens[0]?.kind !== 'text' || raw[0] !== call || raw[1] !== '(' || raw.at(-1) !== ')' || tokens.at(-1)?.parens !== 1) return null;
  const values: string[] = [];
  let value = true;
  for (let i = 2; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (token.parens !== 1) return null;
    if (value) {
      if (token.kind !== 'text' && token.kind !== 'quoted') return null;
      // honk reads any bare value as an exact name (`name(香港01)`); `keyword:` and `regex:` split off at the colon.
      if (token.kind === 'text' && /[\s:]/.test(raw[i])) return null;
      values.push(raw[i]);
    } else if (raw[i] !== ',') return null;
    value = !value;
  }
  return value && values.length ? null : values;
}
const exactIn = (filters: string[], call: ExactCall) => filters.flatMap(filter => (exactTokens(filter, call) ?? []).map(unquote));
export function namedIn(entry: Pick<GroupEntry, 'filters'>): string[] {
  return exactIn(entry.filters, 'name');
}

// What each filter line of a group does, as exact selections and rules: exact names and exact subscription
// tags can be edited by adding and removing; every other line is a rule, shown and left alone.
export function classifyFilters(entry: Pick<GroupEntry, 'filters'>) {
  return {
    names: exactIn(entry.filters, 'name'),
    subtags: exactIn(entry.filters, 'subtag'),
    rules: entry.filters.filter(filter => exactTokens(filter, 'name') === null && exactTokens(filter, 'subtag') === null)
  };
}

// Describe only complete calls; compound or unknown filters retain their source syntax.
export function describeFilters(filters: string[]) {
  let everyNode = false;
  const groups: string[] = [];
  const rules: string[] = [];
  for (const filter of filters) {
    const trimmed = filter.trim();
    const excluded = trimmed.startsWith('!') ? exactTokens(trimmed.slice(1).trim(), 'name')?.map(unquote) : null;
    if (excluded?.length === 2 && new Set(excluded).size === 2 && excluded.includes('direct') && excluded.includes('block')) {
      everyNode = true;
    } else if (exactTokens(trimmed, 'group') !== null) {
      groups.push(...nestedIn({filters: [trimmed]}));
    } else rules.push(filter);
  }
  return {everyNode, groups: [...new Set(groups)], rules};
}

// Whether a filter written as an expression (`subtag(a) && name(keyword: HK)`, `!subtag(a)`) names the tag anywhere.
const expressionNames = (entry: Pick<GroupEntry, 'filters'>, tag: string) =>
  classifyFilters(entry).rules.some(filter =>
    scanConfig(filter).tokens.some(token => (token.kind === 'text' || token.kind === 'quoted') && unquote(filter.slice(token.from, token.to)) === tag)
  );
const citesExactly = (entry: Pick<GroupEntry, 'filters'>, tag: string) => classifyFilters(entry).subtags.includes(tag);

// The groups of a source whose exact subtag filter names a subscription tag.
export const citingGroups = (text: string, tag: string) =>
  readGroupEntries(text)
    .filter(group => citesExactly(group, tag))
    .map(group => group.name);
export const namedInExpression = (text: string, tag: string) => readGroupEntries(text).some(group => expressionNames(group, tag));
// The groups of a source whose filters name a subscription tag in any form: removing or renaming the subscription
// would leave those filters matching nothing.
export const groupsNamingTag = (text: string, tag: string) =>
  readGroupEntries(text)
    .filter(group => citesExactly(group, tag) || expressionNames(group, tag))
    .map(group => group.name);

function editExact(text: string, group: string, call: ExactCall, add: string[], remove: string[]): string {
  const entry = readGroupEntries(text).find(e => e.name === group);
  if (!entry && !add.length) return text;
  const gone = new Set(remove);
  const present = new Set(exactIn(entry?.filters ?? [], call).filter(value => !gone.has(value)));
  const added = [...new Set(add)].filter(value => !present.has(value) && !gone.has(value));
  // Names join a list in its own style: a list written all in single quotes stays that way.
  const written = (list: string[]) => added.map(list.length && list.every(value => value.startsWith("'")) ? quote : quoteName);
  let placed = !added.length;
  const filters: string[] = [];
  for (const filter of entry?.filters ?? []) {
    const raw = exactTokens(filter, call);
    if (raw === null) {
      filters.push(filter);
      continue;
    }
    const kept = raw.filter(value => !gone.has(unquote(value)));
    const values = placed ? kept : [...kept, ...written(kept)];
    placed = true;
    if (values.length) filters.push(`${call}(${values.join(', ')})`);
  }
  if (!placed) filters.push(`${call}(${written([]).join(', ')})`);
  if (entry && filters.length === entry.filters.length && filters.every((filter, i) => filter === entry.filters[i])) return text;
  // A group with no filter line holds every node, so removing its last member would widen it, not empty it.
  if (entry?.filters.length && !filters.length) return text;
  return writeGroupEntry(text, group, {filters, policy: entry?.policy ?? null});
}
export const addSubtagsToGroup = (text: string, group: string, tags: string[]) => editExact(text, group, 'subtag', tags, []);
export const removeSubtagsFromGroup = (text: string, group: string, tags: string[]) => editExact(text, group, 'subtag', [], tags);

// honk's group filter semantics (honk-config parser/groups.rs): each `filter:` line is terms joined by `&&`, each
// term `name(...)` or `subtag(...)`, optionally negated with `!`; arguments are exact values, `keyword:` substrings
// or `regex:` patterns. Lines are joined by OR; a line honk cannot read is ignored.
type Term = {call: ExactCall; negated: boolean; exact: string[]; tests: Array<(value: string) => boolean>};
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim());
}
function parseTerm(raw: string): Term | null {
  const negated = raw.startsWith('!');
  const body = negated ? raw.slice(1).trim() : raw;
  const call = body.startsWith('name(') ? 'name' : body.startsWith('subtag(') ? 'subtag' : null;
  if (!call || !body.endsWith(')')) return null;
  const exact: string[] = [];
  const tests: Term['tests'] = [];
  for (const argument of splitTop(body.slice(call.length + 1, -1), ',')) {
    const keyword = /^keyword:\s*/.exec(argument);
    const regex = /^regex:\s*/.exec(argument);
    const value = unquote(((keyword ?? regex) ? argument.slice((keyword ?? regex)![0].length) : argument).trim());
    if (!value) continue;
    if (keyword) tests.push(candidate => candidate.includes(value));
    else if (regex) {
      let pattern: RegExp;
      try {
        const flags = /^\(\?([ims]+)\)/.exec(value);
        pattern = new RegExp(flags ? value.slice(flags[0].length) : value, flags?.[1]);
      } catch {
        return null;
      }
      tests.push(candidate => pattern.test(candidate));
    } else {
      exact.push(value);
      tests.push(candidate => candidate === value);
    }
  }
  return tests.length ? {call, negated, exact, tests} : null;
}
function parseLine(filter: string): Term[] | null {
  const terms = splitTop(filter, '&&').map(parseTerm);
  return terms.every((term): term is Term => term !== null) && terms.length ? terms : null;
}
export type FilterNode = {name: string; subscription_tag: string | null};
// A group's filter lines parsed and compiled once, as a test honk would apply to each node.
export function compileFilters(filters: string[]): (node: FilterNode) => boolean {
  const lines = filters.map(parseLine).filter((line): line is Term[] => line !== null);
  if (!lines.length) {
    return node => filters.length === 0 && !isBuiltinOutbound(node.name);
  }
  return node =>
    lines.some(
      line =>
        (!isBuiltinOutbound(node.name) || line.some(term => term.call === 'name' && !term.negated && term.exact.includes(node.name))) &&
        line.every(
          term =>
            (term.call === 'subtag' && node.subscription_tag === null
              ? false
              : term.tests.some(test => test(term.call === 'name' ? node.name : node.subscription_tag!))) !== term.negated
        )
    );
}
export const groupAdmits = (filters: string[], node: FilterNode) => compileFilters(filters)(node);

export type ConditionKind = 'domain' | 'domainSuffix' | 'domainKeyword' | 'geosite' | 'dip' | 'geoip' | 'dport' | 'sport' | 'pname' | 'l4proto' | 'sip';
export const conditionKinds: ConditionKind[] = [
  'domainSuffix',
  'domain',
  'domainKeyword',
  'geosite',
  'dip',
  'geoip',
  'sip',
  'dport',
  'sport',
  'pname',
  'l4proto'
];
// DNS rule conditions, as honk's parser reads them: request rules match the query by qname, qtype and sip; response
// rules may also match the upstream that answered and the answer's addresses with ip.
export type DnsConditionKind = 'qnameSuffix' | 'qnameFull' | 'qnameKeyword' | 'qnameGeosite' | 'qtype' | 'sip' | 'upstream' | 'answerIp' | 'answerGeoip';
const dnsRequestKinds: DnsConditionKind[] = ['qnameSuffix', 'qnameFull', 'qnameKeyword', 'qnameGeosite', 'qtype', 'sip'];
export const dnsConditionKinds: Record<'request' | 'response', DnsConditionKind[]> = {
  request: dnsRequestKinds,
  response: [...dnsRequestKinds, 'upstream', 'answerIp', 'answerGeoip']
};
export type RuleConditionKind = ConditionKind | DnsConditionKind;
// Null when the values cannot be written as one condition, such as `a) # x` or an apostrophe that needs quoting.
export function ruleCondition(kind: RuleConditionKind, value: string): string | null {
  const values = value
    .split(/[,\s]+/)
    .map(v => v.trim())
    .filter(Boolean);
  if (values.some(v => syntax.test(v) || (v.includes(':') && !isQuotable(v)))) return null;
  const condition = conditionText(kind, values);
  return isFragment(condition) && !condition.includes('->') ? condition : null;
}
// honk splits a rule on `&&` and `->` and ends a call at `)`, and a quote, `#` or brace starts other syntax, so a value
// holding one is refused rather than written. A colon splits an argument into key and value, so a value with one (an
// IPv6 range) is quoted, as the presets write 'ff00::/8'.
const syntax = /[()'"#{}]|&&|->/;
function conditionText(kind: RuleConditionKind, values: string[]): string {
  const written = values.map(v => (v.includes(':') ? quote(v) : v));
  const list = written.join(', ');
  const qualified = (prefix: string) => written.map(value => `${prefix}: ${value}`).join(', ');
  switch (kind) {
    case 'domain':
      return `domain(${qualified('full')})`;
    case 'domainSuffix':
      return `domain(${qualified('suffix')})`;
    case 'domainKeyword':
      return `domain(${qualified('keyword')})`;
    case 'geosite':
      return `domain(${qualified('geosite')})`;
    case 'dip':
      return `dip(${list})`;
    case 'geoip':
      return `dip(${qualified('geoip')})`;
    case 'sip':
      return `sip(${list})`;
    case 'dport':
      return `dport(${list})`;
    case 'sport':
      return `sport(${list})`;
    case 'pname':
      return `pname(${list})`;
    case 'l4proto':
      return `l4proto(${list})`;
    case 'qnameSuffix':
      return `qname(${qualified('suffix')})`;
    case 'qnameFull':
      return `qname(${qualified('full')})`;
    case 'qnameKeyword':
      return `qname(${qualified('keyword')})`;
    case 'qnameGeosite':
      return `qname(${qualified('geosite')})`;
    case 'qtype':
      return `qtype(${list})`;
    case 'upstream':
      return `upstream(${list})`;
    case 'answerIp':
      return `ip(${list})`;
    case 'answerGeoip':
      return `ip(${qualified('geoip')})`;
  }
}
