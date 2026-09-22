import {blockFields, quote, scanConfig, unquote} from './text';

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

export const quoteName = (value: string) => (/^[\w.-]+$/.test(value) ? value : quote(value));

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

// Only a complete plain call can be extended without changing filter semantics.
function nameTokens(filter: string): string[] | null {
  const tokens = scanConfig(filter).tokens;
  const raw = tokens.map(token => filter.slice(token.from, token.to));
  if (tokens[0]?.kind !== 'text' || raw[0] !== 'name' || raw[1] !== '(' || raw.at(-1) !== ')' || tokens.at(-1)?.parens !== 1) return null;
  const names: string[] = [];
  let value = true;
  for (let i = 2; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (token.parens !== 1) return null;
    if (value) {
      if (token.kind !== 'text' && token.kind !== 'quoted') return null;
      if (token.kind === 'text' && !/^[\w.-]+$/.test(raw[i])) return null;
      names.push(raw[i]);
    } else if (raw[i] !== ',') return null;
    value = !value;
  }
  return value && names.length ? null : names;
}
export function namedIn(entry: Pick<GroupEntry, 'filters'>): string[] {
  return entry.filters.flatMap(filter => (nameTokens(filter) ?? []).map(unquote));
}

// Preserve filters selecting by other means and append a separate name filter.
export function addNamesToGroup(text: string, group: string, names: string[]): string {
  const entry = readGroupEntries(text).find(e => e.name === group);
  const filters = entry ? [...entry.filters] : [];
  const lists = filters.map(nameTokens);
  const at = lists.findIndex(list => list !== null);
  const raw = at === -1 ? [] : lists[at]!;
  const present = new Set(namedIn({filters}));
  const added = [...new Set(names)].filter(name => !present.has(name)).map(quoteName);
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
