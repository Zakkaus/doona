import {isFragment, isQuotable, quote, scanConfig, unquote} from './text';

export const groupConditionKinds = ['nameKeyword', 'nameRegex', 'nameExact', 'subtag', 'subtagKeyword', 'subtagRegex', 'group'] as const;
export type GroupConditionKind = (typeof groupConditionKinds)[number];
type GroupConditionTerm = {id: number; kind: GroupConditionKind; value: string};
export type GroupConditionRow = GroupConditionTerm & {negate: boolean; alternatives?: GroupConditionTerm[]};
export const conditionFamily = (kind: GroupConditionKind) => calls[kind][0];
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
    const terms: GroupConditionTerm[] = [];
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
      if (!value || /[\r\n]/.test(value)) return null;
      const kind = groupConditionKinds.find(kind => calls[kind][0] === head && calls[kind][1] === argumentPrefix);
      if (!kind) return null;
      const values =
        kind === 'group'
          ? value
              .split(/[|,]/)
              .map(value => value.trim())
              .filter(Boolean)
          : [value];
      // A value with an apostrophe cannot be written back as a quoted argument, so the filter stays text.
      if (!values.length || !values.every(isQuotable)) return null;
      const previous = terms.at(-1);
      if (previous?.kind === kind) previous.value = conditionValues([...parseConditionValues(previous.value)!, ...values]);
      else terms.push({id: nextId++, kind, value: conditionValues(values)});
      index++;
      if (raw() === ',') {
        index++;
        if (raw() === ')') return null;
      } else if (raw() !== ')') return null;
    }
    if (raw() !== ')' || !terms.length) return null;
    index++;
    const [first, ...alternatives] = terms;
    if (first.kind === 'group' && (negate || rows.length || index < tokens.length)) return null;
    rows.push({...first, negate, ...(alternatives.length ? {alternatives} : {})});
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
    const arguments_: string[] = [];
    const call = conditionFamily(row.kind);
    for (const term of [row, ...(row.alternatives ?? [])]) {
      const values = parseConditionValues(term.value);
      if (!values || conditionFamily(term.kind) !== call) return null;
      if (term.kind === 'group' && (rows.length !== 1 || row.negate || row.alternatives?.length || values.some(value => /[|,]/.test(value)))) return null;
      const prefix = calls[term.kind][1];
      arguments_.push(...values.map(value => `${prefix}${prefix ? ' ' : ''}${quote(value)}`));
    }
    terms.push(`${row.negate ? '!' : ''}${call}(${arguments_.join(', ')})`);
  }
  return terms.join(' && ');
}
const rowState = (rows: GroupConditionRow[] | null) =>
  JSON.stringify(
    rows?.map(({kind, value, negate, alternatives}) => ({
      kind,
      value,
      negate,
      alternatives: alternatives?.length ? alternatives.map(({kind, value}) => ({kind, value})) : undefined
    })) ?? null
  );
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
