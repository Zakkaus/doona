import {blockFields, isBareName, quote, scanConfig, unquote} from './text';

export type GroupEntry = {
  name: string;
  filters: string[];
  policy: string | null;
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
        return {
          name: entry.name,
          filters: fields.filter(field => field.name === 'filter').map(field => field.value),
          policy: fields.filter(field => field.name === 'policy').at(-1)?.value ?? null,
          from: entry.line,
          to: entry.endLine
        };
      })
    );
}

export const quoteName = (value: string) => (isBareName(value) ? value : quote(value));

// doona creates groups only under bare names, so a new name never needs quoting where filters or rules cite it.
export function groupNameProblem(name: string, taken: ReadonlySet<string>): 'invalid' | 'taken' | null {
  return !isBareName(name) ? 'invalid' : taken.has(name) ? 'taken' : null;
}

export function writeGroupEntry(text: string, name: string, next: {filters: string[]; policy: string | null}): string {
  const {blocks, tokens} = scanConfig(text);
  const sections = blocks.filter(block => block.name === 'group');
  const entry = sections.flatMap(block => block.children).find(entry => entry.name === name);
  if (entry) {
    const lineStart = text.lastIndexOf('\n', entry.from - 1) + 1;
    const prefix = text.slice(lineStart, entry.from);
    const indent = /^\s*$/.test(prefix) ? prefix : '  ';
    const fields = blockFields(text, entry, tokens);
    const bodyStart = entry.open + 1;
    const old = text.slice(bodyStart, entry.close);
    const inner = old.match(/\n([ \t]+)\S/)?.[1] ?? indent + (indent || '    ');
    let kept = old;
    for (const field of fields.filter(field => field.name === 'filter' || field.name === 'policy').reverse()) {
      let from = field.from - bodyStart;
      let to = field.to - bodyStart;
      const start = old.lastIndexOf('\n', from - 1) + 1;
      const end = old.indexOf('\n', to);
      if (/^[ \t\r]*$/.test(old.slice(start, from)) && end !== -1 && /^[ \t\r]*$/.test(old.slice(to, end))) {
        from = start;
        to = end + 1;
      }
      kept = kept.slice(0, from) + kept.slice(to);
    }
    const rest = entry.line === entry.endLine ? (kept.trim() ? `${inner}${kept.trim()}\n` : '') : kept.replace(/^[ \t\r]*\n/, '').replace(/[ \t\r]*$/, '');
    const body = [...next.filters.map(filter => `${inner}filter: ${filter}`), ...(next.policy ? [`${inner}policy: ${next.policy}`] : [])];
    const replacement = '\n' + (body.length ? body.join('\n') + '\n' : '') + rest + indent;
    return text.slice(0, bodyStart) + replacement + text.slice(entry.close);
  }
  const block = sections.at(-1);
  const indent = block ? (text.slice(block.open + 1, block.close).match(/\n([ \t]+)\S/)?.[1] ?? '    ') : '    ';
  const body = [
    `${indent}${quoteName(name)} {`,
    ...next.filters.map(filter => `${indent}${indent}filter: ${filter}`),
    ...(next.policy ? [`${indent}${indent}policy: ${next.policy}`] : []),
    `${indent}}`
  ].join('\n');
  if (block) {
    const closeLine = text.lastIndexOf('\n', block.close - 1) + 1;
    const at = /^[ \t]*$/.test(text.slice(closeLine, block.close)) ? closeLine : block.close;
    return text.slice(0, at) + (text[at - 1] === '\n' ? '' : '\n') + body + '\n' + text.slice(at);
  }
  return `${text.replace(/\n+$/, '')}\n\ngroup {\n${body}\n}\n`;
}

// Only a filter line that is exactly one plain call can be extended without changing filter semantics: filter
// lines combine with OR, so adding a value to `name(a, b)` admits one more node and nothing else, while a line
// with `&&`, `!`, `keyword:` or `regex:` would change meaning.
export type ExactCall = 'name' | 'subtag';
function exactTokens(filter: string, call: ExactCall): string[] | null {
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

// What each filter line of a group does, in the terms the arrange view shows: exact names and exact subscription
// tags can be edited by adding and removing; every other line is a rule, shown and left alone.
export function classifyFilters(entry: Pick<GroupEntry, 'filters'>) {
  return {
    names: exactIn(entry.filters, 'name'),
    subtags: exactIn(entry.filters, 'subtag'),
    rules: entry.filters.filter(filter => exactTokens(filter, 'name') === null && exactTokens(filter, 'subtag') === null)
  };
}

// Whether removing `value` would leave the group without any filter line, which honk reads as every node.
export function removalWidens(entry: Pick<GroupEntry, 'filters'>, call: ExactCall, value: string): boolean {
  return entry.filters.every(filter => {
    const raw = exactTokens(filter, call);
    return raw !== null && raw.every(item => unquote(item) === value);
  });
}

// Adds to the first exact list of `call` (or appends one) and removes from every exact list; a list left empty is
// dropped. Filters selecting by other means are kept as they are.
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
export const addNamesToGroup = (text: string, group: string, names: string[]) => editExact(text, group, 'name', names, []);
export const removeNamesFromGroup = (text: string, group: string, names: string[]) => editExact(text, group, 'name', [], names);
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
        pattern = new RegExp(value);
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
const BUILTIN = new Set(['direct', 'block']);
export type FilterNode = {name: string; subscription_tag: string | null};
// A group's filter lines parsed and compiled once, as a test honk would apply to each node.
export function compileFilters(filters: string[]): (node: FilterNode) => boolean {
  const lines = filters.map(parseLine).filter((line): line is Term[] => line !== null);
  if (!lines.length) {
    const subgroupsOnly = filters.some(filter => filter.startsWith('group('));
    return node => !subgroupsOnly && !BUILTIN.has(node.name);
  }
  return node =>
    lines.some(
      line =>
        (!BUILTIN.has(node.name) || line.some(term => term.call === 'name' && !term.negated && term.exact.includes(node.name))) &&
        line.every(term => term.tests.some(test => test(term.call === 'name' ? node.name : (node.subscription_tag ?? ''))) !== term.negated)
    );
}
export const groupAdmits = (filters: string[], node: FilterNode) => compileFilters(filters)(node);

// An edit staged by the arrange view, applied to the source text in the order it was made.
export type GroupChange =
  | {kind: 'addNode' | 'removeNode' | 'addSubscription' | 'removeSubscription'; group: string; value: string}
  | {kind: 'createGroup'; group: string; policy: string};
export function applyChange(text: string, change: GroupChange): string {
  switch (change.kind) {
    case 'addNode':
      return addNamesToGroup(text, change.group, [change.value]);
    case 'removeNode':
      return removeNamesFromGroup(text, change.group, [change.value]);
    case 'addSubscription':
      return addSubtagsToGroup(text, change.group, [change.value]);
    case 'removeSubscription':
      return removeSubtagsFromGroup(text, change.group, [change.value]);
    case 'createGroup':
      return readGroupEntries(text).some(entry => entry.name === change.group)
        ? text
        : writeGroupEntry(text, change.group, {filters: [], policy: change.policy});
  }
}
export const applyChanges = (text: string, changes: GroupChange[]) => changes.reduce(applyChange, text);

export type ConditionKind = 'domain' | 'domainSuffix' | 'geosite' | 'dip' | 'geoip' | 'dport' | 'sport' | 'pname' | 'l4proto' | 'sip';
export const conditionKinds: ConditionKind[] = ['domainSuffix', 'domain', 'geosite', 'dip', 'geoip', 'sip', 'dport', 'sport', 'pname', 'l4proto'];
export function ruleCondition(kind: ConditionKind, value: string): string {
  const values = value
    .split(/[,\s]+/)
    .map(v => v.trim())
    .filter(Boolean);
  // A value with a colon (an IPv6 range) is quoted, as the presets write 'ff00::/8'; bare, dae reads it as a key.
  const list = values.map(v => (v.includes(':') ? quote(v) : v)).join(', ');
  const qualified = (prefix: string) => values.map(value => `${prefix}: ${value}`).join(', ');
  switch (kind) {
    case 'domain':
      return `domain(${qualified('full')})`;
    case 'domainSuffix':
      return `domain(${qualified('suffix')})`;
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
  }
}
