import {isFragment, isQuotable, quote, scanConfig, unquote} from './text';

export const groupConditionKinds = ['nameKeyword', 'nameRegex', 'nameExact', 'subtag', 'subtagKeyword', 'subtagRegex', 'group'] as const;
export type GroupConditionKind = (typeof groupConditionKinds)[number];
export type GroupConditionRow = {id: number; kind: GroupConditionKind; value: string; negate: boolean};
export type GroupFilterDraft = {id: number; source: string; initial: string; rows: GroupConditionRow[] | null; advanced: boolean};
const calls: Record<GroupConditionKind, [string, string]> = {
  nameKeyword: ['name', 'keyword:'],
  nameRegex: ['name', 'regex:'],
  nameExact: ['name', ''],
  subtag: ['subtag', ''],
  subtagKeyword: ['subtag', 'keyword:'],
  subtagRegex: ['subtag', 'regex:'],
  group: ['group', '']
};
let nextId = 0;
export const newGroupCondition = (): GroupConditionRow => ({id: nextId++, kind: 'nameKeyword', value: '', negate: false});
// Values use CSV-style quotes; JSON escaping preserves regex backslashes and literal quotes.
export const conditionValues = (values: string[]) => values.map(value => (/[,"\r\n]|^\s|\s$/.test(value) ? JSON.stringify(value) : value)).join(', ');
export function parseConditionValues(text: string): string[] | null {
  const values: string[] = [];
  let rest = text.trim();
  while (rest) {
    let value: string;
    if (rest.startsWith('"')) {
      const match = /^"(?:[^"\\]|\\.)*"/.exec(rest);
      if (!match) return null;
      try {
        value = JSON.parse(match[0]) as string;
      } catch {
        return null;
      }
      rest = rest.slice(match[0].length).trimStart();
      if (rest && !rest.startsWith(',')) return null;
    } else {
      const end = rest.indexOf(',');
      value = (end < 0 ? rest : rest.slice(0, end)).trim();
      rest = end < 0 ? '' : rest.slice(end);
    }
    if (!value || !isQuotable(value)) return null;
    values.push(value);
    if (rest) {
      rest = rest.slice(1).trimStart();
      if (!rest) return null;
    }
  }
  return values.length ? values : null;
}
export function parseGroupConditions(source: string): GroupConditionRow[] | null {
  if (!source.trim() || !isFragment(source)) return null;
  const tokens = scanConfig(source).tokens;
  const rows: GroupConditionRow[] = [];
  let index = 0;
  const raw = () => (tokens[index] ? source.slice(tokens[index].from, tokens[index].to) : '');
  while (index < tokens.length) {
    let head = raw();
    let negate = false;
    if (head.startsWith('!')) {
      negate = true;
      head = head.slice(1);
      if (!head) {
        index++;
        head = raw();
      }
    }
    if (!['name', 'subtag', 'group'].includes(head)) return null;
    index++;
    if (raw() !== '(') return null;
    index++;
    const values: string[] = [];
    let prefix: string | undefined;
    while (index < tokens.length && raw() !== ')') {
      let argumentPrefix = '';
      if (raw() === 'keyword' || raw() === 'regex') {
        const possible = raw();
        if (source.slice(tokens[index + 1]?.from, tokens[index + 1]?.to) === ':') {
          argumentPrefix = `${possible}:`;
          index += 2;
        }
      }
      const token = tokens[index];
      if (!token || !['text', 'quoted'].includes(token.kind)) return null;
      const value = unquote(raw());
      if (!value || /[\r\n]/.test(value) || (prefix !== undefined && prefix !== argumentPrefix)) return null;
      prefix = argumentPrefix;
      values.push(value);
      index++;
      if (raw() === ',') {
        index++;
        if (raw() === ')') return null;
      } else if (raw() !== ')') return null;
    }
    if (raw() !== ')' || !values.length) return null;
    index++;
    const kind = groupConditionKinds.find(kind => calls[kind][0] === head && calls[kind][1] === prefix);
    if (!kind || (kind === 'group' && (negate || rows.length || index < tokens.length))) return null;
    rows.push({
      id: nextId++,
      kind,
      value: conditionValues(kind === 'group' ? values.flatMap(value => value.split(/[|,]/).map(value => value.trim())) : values),
      negate
    });
    if (index < tokens.length) {
      if (raw() !== '&&') return null;
      index++;
      if (index === tokens.length) return null;
    }
  }
  return rows.length ? rows : null;
}
export function serializeGroupConditions(rows: GroupConditionRow[]): string | null {
  if (!rows.length) return null;
  const terms: string[] = [];
  for (const row of rows) {
    const values = parseConditionValues(row.value);
    if (!values || (row.kind === 'group' && (rows.length !== 1 || row.negate || values.some(value => /[|,]/.test(value))))) return null;
    const [call, prefix] = calls[row.kind];
    terms.push(`${row.negate ? '!' : ''}${call}(${values.map(value => `${prefix}${prefix ? ' ' : ''}${quote(value)}`).join(', ')})`);
  }
  return terms.join(' && ');
}
const rowState = (rows: GroupConditionRow[] | null) => JSON.stringify(rows?.map(({kind, value, negate}) => ({kind, value, negate})) ?? null);
export function groupFilterDraft(source: string, advanced = false): GroupFilterDraft {
  const rows = parseGroupConditions(source);
  return {id: nextId++, source, rows, initial: rowState(rows), advanced};
}
export function groupFilterText(filter: GroupFilterDraft): string | null {
  return !filter.rows || rowState(filter.rows) === filter.initial ? filter.source : serializeGroupConditions(filter.rows);
}
export const groupFilterTexts = (filters: GroupFilterDraft[]) => filters.map(filter => groupFilterText(filter) ?? filter.source);
// Membership controls retain the row drafts, including unfinished values, of every untouched line.
export function reconcileGroupFilters(previous: GroupFilterDraft[], texts: string[]): GroupFilterDraft[] {
  const remaining = [...previous];
  return texts.map(text => {
    const index = remaining.findIndex(filter => (groupFilterText(filter) ?? filter.source) === text);
    return index < 0 ? groupFilterDraft(text) : remaining.splice(index, 1)[0];
  });
}
export function newGroupFilter(): GroupFilterDraft {
  return {...groupFilterDraft('', true), rows: [newGroupCondition()]};
}
