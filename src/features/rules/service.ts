import type {ConfigSource, DnsRoutingRule, RoutingRule} from '../../api/model';
import {parseConditions, serializeConditions} from '../../dae/conditions';
import {conditionKinds} from '../../dae/groups';
import {geodataKinds, missingCategories, type GeodataPreset} from '../../dae/geodata';
import {scanConfig, unquote} from '../../dae/text';
import {dnsListEnd, dnsRuleAnchor, sourceFor} from '../../dae/ruleText';
import {serviceSections} from '../../dae/templates';
import {isBuiltinOutbound} from '../../dae/vocab';
import type {HeldRule} from '../../store';
import {ruleWritable} from '../shared/rule';

type ServiceInput = {
  sources: ConfigSource[];
  rules: RoutingRule[];
  dnsRules: DnsRoutingRule[];
  selected: string[];
  outbound: string;
  steamCn: boolean;
  preset?: GeodataPreset | null;
  // Rules held for a later apply count as present, so holding a service twice cannot queue it twice.
  held?: HeldRule[];
};
export type ServiceRules = {
  rules: HeldRule[];
  skipped: {service: string; rule?: RoutingRule; held?: true; missing?: string[]}[];
  dnsSkipped: boolean;
  refusal: boolean;
};

// Parse individual call arguments so mixed-prefix calls and expressions outside picker mode still count.
function references(expression: string, kind: 'geosite' | 'geoip', code: string): boolean {
  const text = expression.toLowerCase();
  const tokens = scanConfig(text).tokens.filter(token => token.kind !== 'comment');
  const raw = (i: number) => (tokens[i] ? text.slice(tokens[i].from, tokens[i].to) : '');
  const call = kind === 'geosite' ? 'domain' : 'dip';
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'text' || raw(i).replace(/^(?:!|&&|\|\|)+/, '') !== call || raw(i + 1) !== '(') continue;
    let argument = '';
    for (let j = i + 2; j < tokens.length; j++) {
      // A fully quoted argument such as 'geosite:telegram' means the same unquoted; the picker's parser rejects it with the prefix inside the quotes.
      const quoted = tokens[j].kind === 'quoted' && raw(j).length > 1 && raw(j).at(-1) === raw(j)[0];
      const atom = quoted && unquote(raw(j)).includes(':') ? unquote(raw(j)) : raw(j);
      if (atom === ',' || atom === ')') {
        const rows = parseConditions(`${call}(${argument})`, conditionKinds);
        if (rows?.some(row => row.kind === kind && row.value === code)) return true;
        argument = '';
        if (atom === ')') break;
      } else argument += atom + ' ';
    }
  }
  return false;
}

const telegramDns = /\bqname\s*\([^)]*geosite\s*:\s*["']?telegram["']?\s*[,)]/i;

export function serviceRules({sources, rules, dnsRules, selected, outbound, steamCn, preset, held = []}: ServiceInput): ServiceRules {
  const result: ServiceRules = {rules: [], skipped: [], dnsSkipped: false, refusal: true};
  const fallback = rules.find(rule => rule.kind === 'fallback' && ruleWritable(rule, sources));
  const source = sourceFor(sources, fallback?.source);
  if (!fallback || !source || !outbound) return result;
  const scan = scanConfig(source.content);
  result.refusal = false;
  // First match wins, so a game service must sit above a listed all-games rule in the same source, or that rule would still take its traffic.
  const allGames = rules.find(
    rule =>
      rule.kind === 'rule' && rule.source?.source_id === source.id && ruleWritable(rule, sources) && references(rule.expression, 'geosite', 'category-games')
  );
  const games = serviceSections.find(section => section.id === 'games')!.services.map(service => service.code as string);
  let anchor = fallback;
  const add = (condition: string, target: string) => {
    result.rules.push({sourceId: source.id, list: 'routing', before: anchor, condition, outbound: target, must: false});
  };
  const chosen = serviceSections.flatMap<{code: string; name: string}>(section => [...section.services]);
  chosen.sort((a, b) => Number(a.code === 'category-games') - Number(b.code === 'category-games'));
  for (const {code} of chosen) {
    const existing = rules.find(
      rule => rule.kind === 'rule' && (references(rule.expression, 'geosite', code) || (code === 'telegram' && references(rule.expression, 'geoip', code)))
    );
    if (existing) {
      result.skipped.push({service: code, rule: existing});
      continue;
    }
    if (
      held.some(
        item => item.list === 'routing' && (references(item.condition, 'geosite', code) || (code === 'telegram' && references(item.condition, 'geoip', code)))
      )
    ) {
      result.skipped.push({service: code, held: true});
      continue;
    }
    const required = {geosite: [code], geoip: code === 'telegram' ? [code] : []};
    if (code === 'steam' && steamCn && !isBuiltinOutbound(outbound)) required.geosite.push('steam@cn');
    const missing = missingCategories(preset ?? null, required);
    if (missing) {
      result.skipped.push({service: code, missing: geodataKinds.flatMap(kind => (missing[kind] ?? []).map(value => `${kind}:${value}`))});
      continue;
    }
    if (!selected.includes(code)) continue;
    anchor = allGames && code !== 'category-games' && games.includes(code) ? allGames : fallback;
    if (
      code === 'steam' &&
      steamCn &&
      !isBuiltinOutbound(outbound) &&
      !rules.some(rule => references(rule.expression, 'geosite', 'steam@cn')) &&
      !held.some(item => item.list === 'routing' && references(item.condition, 'geosite', 'steam@cn'))
    )
      add('domain(geosite:steam@cn)', 'direct');
    add(`domain(geosite:${code})`, outbound);
    if (code !== 'telegram') continue;
    add('dip(geoip:telegram)', outbound);
    // A Telegram DNS rule already listed or held is kept as it is.
    if (
      [...dnsRules.map(rule => rule.expression), ...held.filter(item => item.list === 'request').map(item => item.condition)].some(text =>
        telegramDns.test(text)
      )
    )
      continue;
    const condition = serializeConditions([
      {kind: 'qnameGeosite', value: 'telegram', negate: false},
      {kind: 'qtype', value: 'https, svcb', negate: false}
    ])!;
    const dnsFallback = dnsRules.find(rule => rule.kind === 'fallback');
    const before = dnsFallback?.source ? dnsFallback : null;
    const placed = before ? !!dnsRuleAnchor(source, before, 'request', scan) : dnsListEnd(sources, 'request')?.source.id === source.id;
    if (!placed) {
      result.dnsSkipped = true;
      continue;
    }
    result.rules.push({sourceId: source.id, list: 'request', before, condition, outbound: 'reject', must: false});
  }
  return result;
}
