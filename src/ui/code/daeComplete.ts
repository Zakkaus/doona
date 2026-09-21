import {autocompletion, type Completion, type CompletionContext, type CompletionResult} from '@codemirror/autocomplete';
import * as vocab from '../../api/daeVocab';
import {scanConfig} from '../../features/config/blocks';

const sections = ['global', 'subscription', 'node', 'group', 'dns', 'routing'].map(label => ({label, type: 'keyword'}));
const globalKeys = vocab.globalKeys.map(label => ({label, type: 'property', apply: label + ': '}));
const conditions = ['domain', 'dip', 'sip', 'dport', 'sport', 'l4proto', 'ipversion', 'pname', 'mac', 'dscp', 'qname', 'qtype', 'upstream'].map(label => ({
  label,
  type: 'function',
  apply: label + '('
}));
const matchers = ['geosite', 'geoip', 'suffix', 'full', 'keyword', 'regex'].map(label => ({label, type: 'constant', apply: label + ':'}));
const policies = vocab.policies.map(label => ({label, type: 'constant'}));
const builtins = vocab.builtinOutbounds.map(label => ({label, type: 'keyword'}));
const routingWords = [
  {label: 'fallback', type: 'keyword', apply: 'fallback: '},
  {label: 'include', type: 'keyword', apply: 'include '}
];

export function completeDae(context: CompletionContext, outbounds: () => string[]): CompletionResult | null {
  const word = context.matchBefore(/[\w.-]*/);
  if (!word) return null;
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const afterArrow = /->\s*[\w.-]*$/.test(before) || /^\s*fallback:\s*[\w.-]*$/.test(before);
  // An empty word only opens the list where the next token is obvious: right after an arrow.
  if (word.from === word.to && !context.explicit && !afterArrow) return null;
  const text = context.state.doc.sliceString(0, context.pos);
  const {blocks, tokens} = scanConfig(text);
  const last = tokens.at(-1);
  if (last?.to === context.pos && (last.kind === 'quoted' || last.kind === 'comment')) return null;
  const section = blocks.find(block => block.close === context.pos)?.name;
  let options: Completion[];
  if (afterArrow) {
    options = [...outbounds().map(label => ({label, type: 'variable'})), ...builtins];
  } else if (/\b(domain|dip|sip|qname)\(\s*[\w.-]*$/.test(before)) {
    options = matchers;
  } else if (section === undefined) {
    options = sections.map(item => ({
      ...item,
      // The cursor lands on the indented blank line inside the new section.
      apply: (view, _completion, from, to) => {
        const insert = item.label + ' {\n  \n}';
        view.dispatch({changes: {from, to, insert}, selection: {anchor: from + item.label.length + 4}});
      }
    }));
  } else if (section === 'routing' || section === 'dns') {
    options = [...conditions, ...routingWords];
  } else if (section === 'global') {
    options = globalKeys;
  } else if (section === 'group') {
    options = /\bpolicy\s*:\s*[\w.-]*$/.test(before)
      ? policies
      : [...policies.map(item => ({...item, apply: 'policy: ' + item.label})), {label: 'filter', type: 'property', apply: 'filter: '}];
  } else {
    return null;
  }
  return {from: word.from, options, validFor: /^[\w.-]*$/};
}

export function daeCompletion(outbounds: () => string[]) {
  return autocompletion({override: [context => completeDae(context, outbounds)]});
}
