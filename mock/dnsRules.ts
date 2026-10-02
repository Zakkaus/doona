import type {ConfigSource, DnsRoutingRule, DnsRuleList} from '../src/api/model';
import {scanConfig} from '../src/dae/text';
import {dnsUpstreamNames} from '../src/dae/ruleText';
import {blockLines} from './config';

type List = 'request' | 'response';
// What honk falls back to when a list writes no fallback: a query goes to its original destination, an answer is kept.
const defaults: Record<List, DnsRoutingRule['action']> = {request: 'asis', response: 'accept'};
const keywords: Record<List, string[]> = {request: ['asis', 'reject'], response: ['accept', 'reject']};

// GET /dns/rules from the rule files: `dns { routing { request { … } response { … } } }` in each, in file order.
export function dnsRulesOf(files: Array<ConfigSource & {content: string}>, generation: string): DnsRuleList {
  const upstreams = files.flatMap(file => dnsUpstreamNames(file.content));
  const resolve = (name: string) => upstreams.find(upstream => upstream.toLowerCase() === name.toLowerCase()) ?? name;
  const lists: Record<List, DnsRoutingRule[]> = {request: [], response: []};
  const fallbacks: Partial<Record<List, DnsRoutingRule>> = {};
  const entry = (list: List, target: string) => {
    const keyword = target.toLowerCase();
    if (keywords[list].includes(keyword)) return {action: keyword as DnsRoutingRule['action'], upstream: null};
    return {action: list === 'request' ? ('upstream' as const) : ('requery' as const), upstream: resolve(target)};
  };
  for (const file of files) {
    const {blocks} = scanConfig(file.content);
    const routings = blocks.filter(block => block.name === 'dns').flatMap(dns => dns.children.filter(child => child.name === 'routing'));
    for (const routing of routings) {
      for (const block of routing.children) {
        const list = block.name as List;
        if (list !== 'request' && list !== 'response') continue;
        for (const {code, raw, line} of blockLines(file.content, block)) {
          const fallback = /^(?:fallback|default):\s*('[^']*'|"[^"]*"|\S+)$/.exec(code);
          const rule = /^(.+?)\s*->\s*('[^']*'|"[^"]*"|\S+)$/.exec(code);
          if (!fallback && !rule) continue;
          const column = new TextEncoder().encode(raw.slice(0, raw.search(/\S/))).length + 1;
          const source = {file: file.path.split('/').pop()!, source_id: file.id, line, column};
          if (fallback) fallbacks[list] = {rule_id: `${list}:fallback`, index: 0, expression: code, ...entry(list, fallback[1]), source, kind: 'fallback'};
          else
            lists[list].push({
              rule_id: `${list}:${source.file}:${line}`,
              index: lists[list].length,
              expression: code,
              ...entry(list, rule![2]),
              source,
              kind: 'rule'
            });
        }
      }
    }
  }
  const finish = (list: List) => [
    ...lists[list],
    {
      ...(fallbacks[list] ?? {
        rule_id: `${list}:fallback`,
        expression: `fallback: ${defaults[list]}`,
        action: defaults[list],
        upstream: null,
        source: null,
        kind: 'fallback' as const
      }),
      index: lists[list].length
    }
  ];
  // entry() keeps each list to its own actions, which the contract types list by list.
  return {generation_id: generation, request: finish('request') as DnsRuleList['request'], response: finish('response') as DnsRuleList['response']};
}
