import {splitTop, type ExactCall} from './groups';
import {unquote} from './text';
import {rustRegexToJs} from './rustRegex';
import {isBuiltinOutbound} from './vocab';

// honk's group filter semantics (honk-config parser/groups.rs): each `filter:` line is terms joined by `&&`, each
// term `name(...)` or `subtag(...)`, optionally negated with `!`; arguments are exact values, `keyword:` substrings
// or `regex:` patterns. Lines are joined by OR; a line honk cannot read is ignored.
type Term = {call: ExactCall; negated: boolean; exact: string[]; tests: Array<(value: string) => boolean>};
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
      const pattern = rustRegexToJs(value);
      if (!pattern) return null;
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
