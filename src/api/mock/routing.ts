import type {RoutingTraceInput, RoutingTraceRequest, RoutingTraceResponse} from '../model';
import {ApiError} from '../error';
import {configRules, dnsCache, instanceId} from './fixtures';

type Evaluation = RoutingTraceResponse['evaluations'][number];
type Condition = Evaluation['rules'][number]['conditions'][number];
const geosites: Record<string, string[]> = {
  cn: ['cn', 'bilibili.com', 'baidu.com', 'qq.com'],
  telegram: ['telegram.org', 'telegram.me', 't.me', 'telegra.ph'],
  discord: ['discord.com', 'discord.gg', 'discordapp.com']
};
const fields: Record<string, keyof RoutingTraceInput | 'mac'> = {
  domain: 'domain',
  pname: 'pname',
  l4proto: 'network',
  dport: 'dst_port',
  dip: 'dst_ip',
  sip: 'src_ip',
  ipversion: 'dst_ip',
  mac: 'mac'
};
const domainName = (name: string) => name.toLowerCase().replace(/\.$/, '');
const suffix = (name: string, value: string) => name === value || name.endsWith('.' + value);
function subnet(ip: string, range: string): boolean {
  const [base, bits = '32'] = range.split('/');
  if (ip.includes(':') || base.includes(':')) return ip.toLowerCase() === base.toLowerCase();
  const number = (value: string) => value.split('.').reduce((n, part) => (n << 8) | Number(part), 0) >>> 0;
  const mask = Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
  return (number(ip) & mask) === (number(base) & mask);
}
function predicate(expression: string, input: RoutingTraceInput): Pick<Condition, 'result' | 'missing_inputs'> {
  const match = /^(\w+)\((.*)\)$/.exec(expression)!;
  const [, kind, arg] = match;
  const field = fields[kind];
  const value = field === 'mac' ? undefined : input[field];
  if (value == null || value === '') return {result: 'indeterminate', missing_inputs: [field ?? kind]};
  let matched = false;
  if (kind === 'domain') {
    const [mode, term] = arg.split(':').map(s => s.trim());
    const name = domainName(String(value));
    matched =
      mode === 'geosite'
        ? (geosites[term] ?? []).some(s => suffix(name, s))
        : mode === 'suffix'
          ? suffix(name, domainName(term))
          : mode === 'full'
            ? name === domainName(term)
            : mode === 'keyword' && name.includes(domainName(term));
  } else if (kind === 'dip' || kind === 'sip') {
    const ip = String(value).toLowerCase();
    matched =
      arg === 'geoip: private'
        ? ip.includes(':')
          ? /^(f[cd]|fe[89ab])/.test(ip) || ip === '::1'
          : ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'].some(range => subnet(ip, range))
        : arg.split(',').some(range => subnet(ip, range.trim()));
  } else if (kind === 'ipversion') matched = arg === (String(value).includes(':') ? '6' : '4');
  else matched = arg.split(',').some(item => item.trim() === String(value));
  return {result: matched ? 'matched' : 'not_matched', missing_inputs: []};
}
function evaluate(input: RoutingTraceInput): Evaluation {
  let matched = false,
    outbound: string | null = null;
  const missing = new Set<string>();
  const rules: Evaluation['rules'] = configRules.rules.map(rule => {
    const conditions = rule.cond.split(/\s*&&\s*/).map((expression, i): Condition => ({
      id: rule.id + '/' + i,
      expression,
      ...(matched ? {result: 'skipped', missing_inputs: []} : predicate(expression, input))
    }));
    const result = matched
      ? 'skipped'
      : conditions.some(c => c.result === 'not_matched')
        ? 'not_matched'
        : conditions.some(c => c.result === 'indeterminate')
          ? 'indeterminate'
          : 'matched';
    const missing_inputs = result === 'indeterminate' ? [...new Set(conditions.flatMap(c => c.missing_inputs))] : [];
    for (const field of missing_inputs) missing.add(field);
    if (result === 'matched') {
      matched = true;
      outbound = rule.target;
    }
    return {rule_id: rule.id, expression: rule.cond + ' -> ' + rule.target + (rule.must ? '(must)' : ''), result, missing_inputs, conditions};
  });
  rules.push({
    rule_id: 'fallback',
    expression: 'fallback: ' + configRules.fallback.target,
    result: matched ? 'skipped' : 'matched',
    missing_inputs: [],
    conditions: []
  });
  if (!matched) outbound = configRules.fallback.target;
  // A later match cannot resolve an earlier rule whose inputs are missing.
  return {
    dst_ip: input.dst_ip ?? null,
    decision: missing.size ? 'indeterminate' : 'determinate',
    outbound: missing.size ? null : outbound,
    missing_inputs: [...missing],
    rules
  };
}
export function routingTrace({input, resolve}: RoutingTraceRequest): RoutingTraceResponse {
  if (!input.domain && !input.dst_ip) throw new ApiError(400, 'invalid_input', 'A domain or destination IP is required');
  if (resolve === 'live' && (!input.domain || input.dst_ip))
    throw new ApiError(400, 'invalid_input', 'Live resolution requires a domain and no destination IP');
  const response: RoutingTraceResponse = {
    mode: 'simulation',
    instance_id: instanceId,
    generation_id: configRules.generation_id,
    observed_at: new Date().toISOString(),
    evaluations: [],
    dns: []
  };
  if (resolve === 'none') {
    response.evaluations.push(evaluate(input));
    return response;
  }
  const name = domainName(input.domain!) + '.';
  const entries = dnsCache.entries.filter(e => e.domain === name && (e.type === 'A' || e.type === 'AAAA'));
  const addresses = [...new Set(entries.flatMap(e => (e.answers ?? []).filter(a => a.type === 'A' || a.type === 'AAAA').map(a => a.data)))];
  response.dns.push({
    lookup_id: 'simulation-dns-1',
    parent_lookup_id: null,
    attempt_id: null,
    purpose: 'dial_target',
    name,
    qtype: entries.length === 1 ? entries[0].type : 'ANY',
    source: 'cache',
    upstream_transport: null,
    carrier_transport: null,
    cache: entries.length ? 'hit' : 'miss',
    cache_entry_id: entries.length === 1 ? entries[0].entry_id : null,
    upstream: null,
    route_evaluation_ids: [],
    status: addresses.length ? 'NOERROR' : (entries[0]?.status ?? 'SERVFAIL'),
    addresses,
    selected_ip: null,
    error: entries.length ? null : 'No address in mock DNS cache'
  });
  response.evaluations = addresses.map(dst_ip => evaluate({...input, dst_ip}));
  return response;
}
