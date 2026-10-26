import type {ConfigSource, RoutingTraceInput, RoutingTraceResponse, RoutingRule} from '../../../src/api/model';
import {ipLiteral, simulatedAddress} from '../../../src/api/selectors';
import {scanConfig} from '../../../src/dae/text';
import {configSnapshot, LiteError, readMain, type Connection} from './api';
import {parseRuleList, type DraftRule} from './ruleDraft';

export function testInput(value: string, port: number | null, network: 'tcp' | 'udp'): RoutingTraceInput {
  const raw = value.trim();
  if (!raw || /\s/.test(raw)) throw new LiteError('testInvalidAddress');
  let url: URL;
  try {
    const bareIp = ipLiteral(raw);
    url = new URL(bareIp?.includes(':') ? `https://[${bareIp}]` : /^[\w+.-]+:\/\//.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname || url.username || url.password) throw new Error();
  } catch {
    throw new LiteError('testInvalidAddress');
  }
  const authority = raw.replace(/^[\w+.-]+:\/\//, '').split(/[/?#]/)[0];
  const explicitPort = !ipLiteral(raw) ? authority.match(/:(\d+)$/)?.[1] : undefined;
  const dst_port = port ?? (explicitPort ? Number(explicitPort) : url.protocol === 'http:' ? 80 : 443);
  if (!Number.isInteger(dst_port) || dst_port < 1 || dst_port > 65535) throw new LiteError('testInvalidPort');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ip = ipLiteral(host);
  return {network, dst_port, pname: '', ...(ip ? {dst_ip: ip} : {domain: host})};
}

export async function runRoutingTest(connection: Connection, input: RoutingTraceInput) {
  const {
    api,
    capabilities: {resources}
  } = connection;
  const modes = resources.routing_trace.resolve_modes ?? [];
  const trace = async (): Promise<RoutingTraceResponse[]> => {
    if (input.domain && modes.includes('live')) return [await api.routingTrace({input, resolve: 'live'})];
    if (!modes.includes('none')) throw new LiteError('unsupported');
    const dns = resources.dns_query;
    const types = (dns?.record_types ?? []).filter(type => type === 'A' || type === 'AAAA');
    if (input.domain && dns?.available && types.length) {
      const addresses = new Set<string>();
      const limit = Math.max(1, dns.limits?.max_types_per_request ?? 1);
      for (let i = 0; i < types.length; i += limit) {
        const query = await api.dnsQuery(input.domain, types.slice(i, i + limit));
        query.results.flatMap(result => simulatedAddress(result) ?? []).forEach(address => addresses.add(address));
      }
      const traces: RoutingTraceResponse[] = [];
      for (const address of addresses) traces.push(await api.routingTrace({input: {...input, dst_ip: address}, resolve: 'none'}));
      if (traces.length) return traces;
    }
    return [await api.routingTrace({input, resolve: 'none'})];
  };
  const [traces, rules, source] = await Promise.all([trace(), resources.rules.available ? api.rules() : Promise.resolve(null), readMain(api)]);
  const generation = configSnapshot(api)?.generation_id;
  if (
    (generation !== undefined && generation !== traces[0].generation_id) ||
    traces.some(item => item.generation_id !== traces[0].generation_id || item.instance_id !== traces[0].instance_id) ||
    (rules && rules.generation_id !== traces[0].generation_id)
  )
    throw new LiteError('testConfigChanged');
  return {traces, rules, source};
}
export type RoutingTestResult = Awaited<ReturnType<typeof runRoutingTest>>;

export function sourceRule(source: ConfigSource, rule: RoutingRule): DraftRule | undefined {
  if (rule.source?.source_id !== source.id) return undefined;
  return parseRuleList(source.content, 'routing').rows.find(row => {
    const token = scanConfig(row.raw).tokens.find(token => token.kind !== 'comment');
    return token && source.content.slice(0, row.from + token.from).split('\n').length === Number(rule.source!.line);
  });
}

export function matchedRule(result: RoutingTestResult, id: string) {
  return result.rules?.rules.find(rule => rule.rule_id === id);
}
