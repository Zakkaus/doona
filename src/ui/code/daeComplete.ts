import {autocompletion, type Completion, type CompletionContext, type CompletionResult} from '@codemirror/autocomplete';
import * as vocab from '../../api/daeVocab';

// What dae text can say, offered by where the cursor is: section names at the top level, keys inside global
// and dns, condition functions in routing, an outbound after "->" or "fallback:", policies inside group.
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

function sectionAt(context: CompletionContext): string | null {
  const text = context.state.doc.sliceString(0, context.pos);
  const stack: string[] = [];
  for (const line of text.split('\n')) {
    const code = line.replace(/#.*$/, '');
    const open = /^\s*([A-Za-z_][\w.-]*)\s*\{/.exec(code);
    if (open) stack.push(open[1]);
    const closes = (code.match(/\}/g) ?? []).length;
    for (let i = 0; i < closes; i++) stack.pop();
  }
  return stack[0] ?? null;
}

// Completions for dae; `outbounds` are the group names the current text (or the running config) defines.
export function daeCompletion(outbounds: () => string[]) {
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const word = context.matchBefore(/[\w.-]*/);
        if (!word) return null;
        const line = context.state.doc.lineAt(context.pos);
        const before = line.text.slice(0, context.pos - line.from);
        const afterArrow = /->\s*[\w.-]*$/.test(before) || /^\s*fallback:\s*[\w.-]*$/.test(before);
        // An empty word only opens the list where the next token is obvious: right after an arrow.
        if (word.from === word.to && !context.explicit && !afterArrow) return null;
        const section = sectionAt(context);
        let options: Completion[];
        if (afterArrow) {
          options = [...outbounds().map(label => ({label, type: 'variable'})), ...builtins];
        } else if (/\b(domain|dip|sip|qname)\(\s*[\w.-]*$/.test(before)) {
          options = matchers;
        } else if (section === null) {
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
          options = [...policies.map(item => ({...item, apply: 'policy: ' + item.label})), {label: 'filter', type: 'property', apply: 'filter: '}];
        } else {
          return null;
        }
        return {from: word.from, options, validFor: /^[\w.-]*$/};
      }
    ]
  });
}
