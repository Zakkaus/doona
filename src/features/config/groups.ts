import {topLevelBlocks} from './blocks';

// The `group {}` section as the pages edit it: each named subsection's filters and policy, everything else
// in the subsection kept as written. No dae parser; subsections are cut by brace matching, one per line.
export type GroupEntry = {
  name: string;
  filters: string[];
  policy: string | null;
  // Line range in the source, inclusive of the braces.
  from: number;
  to: number;
};

const uncomment = (line: string) => line.replace(/#.*$/, '');
const name = /(?:'([^']*)'|"([^"]*)"|([^\s{}'"]+))/.source;
const header = new RegExp(`^\\s*${name}\\s*\\{\\s*$`);
const oneLine = new RegExp(`^\\s*${name}\\s*\\{(.*)\\}\\s*$`);
const keys = /\s+(?=(?:filter|policy|default|final|check_url|check_interval|tolerance|idle_timeout|interrupt_connections|interruption)\s*:)/;
const field = /^\s*([A-Za-z_][\w.-]*)\s*:\s*(.*?)\s*$/;

export function readGroupEntries(text: string): GroupEntry[] {
  const lines = text.split('\n');
  const entries: GroupEntry[] = [];
  for (const block of topLevelBlocks(lines, 'group')) readBlock(lines, block, entries);
  return entries;
}
function readBlock(lines: string[], block: {open: number; close: number}, entries: GroupEntry[]) {
  for (let i = block.open + 1; i < block.close; i++) {
    const code = uncomment(lines[i]);
    const filters: string[] = [];
    let policy: string | null = null;
    const take = (kv: RegExpExecArray | null) => {
      if (kv?.[1] === 'filter') filters.push(kv[2]);
      else if (kv?.[1] === 'policy') policy = kv[2];
    };
    const single = oneLine.exec(code);
    if (single) {
      single[4]
        .trim()
        .split(keys)
        .forEach(part => take(field.exec(part)));
      entries.push({name: single[1] ?? single[2] ?? single[3], filters, policy, from: i, to: i});
      continue;
    }
    const head = header.exec(code);
    if (!head) continue;
    let depth = 1;
    let j = i + 1;
    for (; j < block.close && depth > 0; j++) {
      const inner = uncomment(lines[j]);
      depth += (inner.match(/\{/g) ?? []).length - (inner.match(/\}/g) ?? []).length;
      take(field.exec(inner));
    }
    entries.push({name: head[1] ?? head[2] ?? head[3], filters, policy, from: i, to: j - 1});
    i = j - 1;
  }
}

const quoteName = (value: string) => (/^[\w.-]+$/.test(value) ? value : `'${value.replace(/'/g, '')}'`);

// The text with `name`'s filters and policy set: a known group keeps every other line and its indentation, a
// new one is appended to the section, and a source without a `group` section gains one at the end.
export function writeGroupEntry(text: string, name: string, next: {filters: string[]; policy: string | null}): string {
  const lines = text.split('\n');
  const entry = readGroupEntries(text).find(e => e.name === name);
  if (entry) {
    const indent = lines[entry.from].match(/^\s*/)?.[0] ?? '    ';
    const single = oneLine.exec(uncomment(lines[entry.from]));
    // A one-line entry unfolds with the file's own step: as far in from its header as the header is from `group`.
    const step = indent || '    ';
    const old = single
      ? single[4]
          .trim()
          .split(keys)
          .map(part => indent + step + part.trim())
      : lines.slice(entry.from + 1, entry.to);
    const inner = old.find(line => line.trim())?.match(/^\s*/)?.[0] ?? indent + step;
    const kept = old.filter(line => {
      const kv = field.exec(uncomment(line));
      return kv?.[1] !== 'filter' && kv?.[1] !== 'policy';
    });
    const body = [...next.filters.map(filter => `${inner}filter: ${filter}`), ...(next.policy ? [`${inner}policy: ${next.policy}`] : []), ...kept];
    if (single) lines.splice(entry.from, 1, `${indent}${quoteName(name)} {`, ...body, `${indent}}`);
    else lines.splice(entry.from + 1, entry.to - entry.from - 1, ...body);
    return lines.join('\n');
  }
  const block = topLevelBlocks(lines, 'group').at(-1) ?? null;
  const indent = block
    ? (lines
        .slice(block.open + 1, block.close)
        .find(line => line.trim())
        ?.match(/^\s*/)?.[0] ?? '    ')
    : '    ';
  const inner = indent + indent;
  const body = [
    `${indent}${quoteName(name)} {`,
    ...next.filters.map(filter => `${inner}filter: ${filter}`),
    ...(next.policy ? [`${inner}policy: ${next.policy}`] : []),
    `${indent}}`
  ];
  if (block) {
    lines.splice(block.close, 0, ...body);
    return lines.join('\n');
  }
  const trimmed = text.replace(/\n+$/, '');
  return `${trimmed}\n\ngroup {\n${body.join('\n')}\n}\n`;
}

// The node names a group's plain `name(...)` filter lists; keyword and regex forms select differently.
const plainName = (filter: string) => /^name\(/.test(filter) && !/^name\((keyword|regex)\s*:/.test(filter);
const nameTokens = (filter: string) => (filter.match(/'([^']*)'|"([^"]*)"|([\w.-]+)/g) ?? []).slice(1);
export function namedIn(entry: Pick<GroupEntry, 'filters'>): string[] {
  return entry.filters.filter(plainName).flatMap(filter => nameTokens(filter).map(v => v.replace(/^['"]|['"]$/g, '')));
}

// Nodes joining a group by name: the names go into the group's `name(...)` filter, which is added when the
// group selects by other means. Names already present are not repeated.
export function addNamesToGroup(text: string, group: string, names: string[]): string {
  const entry = readGroupEntries(text).find(e => e.name === group);
  const filters = entry ? [...entry.filters] : [];
  const at = filters.findIndex(plainName);
  const raw = at === -1 ? [] : nameTokens(filters[at]);
  const present = namedIn({filters});
  const added = names.filter(name => !present.includes(name)).map(quoteName);
  if (!added.length) return text;
  const list = [...raw, ...added].join(', ');
  if (at === -1) filters.push(`name(${list})`);
  else filters[at] = `name(${list})`;
  return writeGroupEntry(text, group, {filters, policy: entry?.policy ?? null});
}

export type ConditionKind = 'domain' | 'domainSuffix' | 'geosite' | 'dip' | 'geoip' | 'dport' | 'sport' | 'pname' | 'l4proto' | 'sip';
export const conditionKinds: ConditionKind[] = ['domainSuffix', 'domain', 'geosite', 'dip', 'geoip', 'sip', 'dport', 'sport', 'pname', 'l4proto'];
export function ruleCondition(kind: ConditionKind, value: string): string {
  const values = value
    .split(/[,\s]+/)
    .map(v => v.trim())
    .filter(Boolean);
  const list = values.join(', ');
  switch (kind) {
    case 'domain':
      return `domain(${list})`;
    case 'domainSuffix':
      return `domain(suffix: ${list})`;
    case 'geosite':
      return `domain(geosite: ${list})`;
    case 'dip':
      return `dip(${list})`;
    case 'geoip':
      return `dip(geoip: ${list})`;
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

// The policy names honk documents, with the dae spellings each one accepts; an unknown spelling reads as selector.
export const policyNames = ['selector', 'urltest', 'loadbalance', 'fallback', 'score'] as const;
export type PolicyName = (typeof policyNames)[number];
const policyAliases: Record<string, PolicyName> = {
  select: 'selector',
  fixed: 'selector',
  min_moving_avg: 'urltest',
  min_avg10: 'urltest',
  min_last_delay: 'urltest',
  roundrobin: 'loadbalance',
  round_robin: 'loadbalance',
  balance: 'loadbalance'
};
export function canonicalPolicy(raw: string | null): PolicyName {
  const name = (raw ?? 'selector').toLowerCase().replace(/\(.*$/, '');
  return (policyNames as readonly string[]).includes(name) ? (name as PolicyName) : (policyAliases[name] ?? 'selector');
}
