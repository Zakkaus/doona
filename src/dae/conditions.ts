import {ruleCondition, type RuleConditionKind} from './groups';
import {scanConfig, unquote} from './text';

export type RuleConditionRow = {kind: RuleConditionKind; value: string; negate: boolean};

export function serializeConditions(rows: readonly RuleConditionRow[]): string | null {
  if (!rows.length) return null;
  const calls = rows.map(row => (row.value.split(/[,\s]+/).some(Boolean) ? ruleCondition(row.kind, row.value) : null));
  return calls.some(call => call === null) ? null : calls.map((call, i) => `${rows[i].negate ? '!' : ''}${call}`).join(' && ');
}

// A call stays in Expression mode unless the picker can reproduce every argument without changing its meaning.
export function parseConditions(text: string, kinds: readonly RuleConditionKind[]): RuleConditionRow[] | null {
  const rows: RuleConditionRow[] = [];
  const call = /\s*(!?)\s*(\w+)\s*\(([^()]*)\)\s*/y;
  let offset = 0;
  while (offset < text.length) {
    call.lastIndex = offset;
    const match = call.exec(text);
    if (!match) return null;
    const [, negate, name, body] = match;
    const tokens = scanConfig(body).tokens;
    const args: Array<{prefix: string; value: string}> = [];
    let i = 0;
    while (i < tokens.length) {
      const raw = (n: number) => body.slice(tokens[n].from, tokens[n].to);
      let prefix = '';
      if (tokens[i + 1] && raw(i + 1) === ':') {
        prefix = raw(i);
        i += 2;
      }
      const token = tokens[i];
      if (!token || (token.kind !== 'text' && token.kind !== 'quoted')) return null;
      const atom = raw(i++);
      if (token.kind === 'quoted' && (atom.length < 2 || atom.at(-1) !== atom[0])) return null;
      if (token.kind === 'quoted' && !prefix && (name === 'domain' || name === 'qname')) return null;
      const value = unquote(atom);
      if (!value || /[,\s]/.test(value)) return null;
      args.push({prefix: prefix || (name === 'domain' || name === 'qname' ? 'suffix' : ''), value});
      if (i < tokens.length && (raw(i++) !== ',' || i === tokens.length)) return null;
    }
    if (!args.length || args.some(arg => arg.prefix !== args[0].prefix)) return null;
    const kind = kinds.find(kind => {
      const sample = ruleCondition(kind, 'value');
      return sample === `${name}(${args[0].prefix ? `${args[0].prefix}: ` : ''}value)`;
    });
    if (!kind) return null;
    const row = {kind, value: args.map(arg => arg.value).join(', '), negate: !!negate};
    if (serializeConditions([row]) === null) return null;
    rows.push(row);
    offset = call.lastIndex;
    if (offset === text.length) break;
    if (text.slice(offset, offset + 2) !== '&&') return null;
    offset += 2;
    if (!text.slice(offset).trim()) return null;
  }
  return rows.length ? rows : null;
}
