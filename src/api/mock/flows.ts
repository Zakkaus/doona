import type {Connection, FlowDetail, FlowStep} from '../model';

export type FlowFields = Pick<Connection, 'chain' | 'chain_source' | 'rule_id' | 'rule_expression' | 'rule_source' | 'ingress' | 'domain_source'>;
export type ConnectionSeed = Omit<Connection, keyof FlowFields>;

export function flowFields(input: FlowDetail['input'], steps: FlowStep[]): FlowFields {
  const outbound = steps.find(s => s.stage === 'outbound')?.data;
  const route = steps.find(s => s.stage === 'route')?.data;
  return {
    chain: outbound ? [...outbound.selection_path.map(p => p.group_id), ...(outbound.leaf_node_id ? [outbound.leaf_node_id] : [])] : [],
    chain_source: outbound ? 'evaluation' : 'unknown',
    rule_id: route?.rule_id ?? null,
    rule_expression: route?.rules.find(r => r.rule_id === route.rule_id)?.expression ?? null,
    rule_source: route ? (route.plane === 'kernel' ? 'kernel' : 'recomputed') : 'unknown',
    ingress: input.ingress,
    domain_source: input.domain_source
  };
}

// A slice of a real-world rule set, so the demo shows how a config with many rules reads.
const ruleTable: Array<[string[], string]> = [
  [['netflix.com', 'nflxvideo.net'], 'domain(geosite: netflix)'],
  [['youtube.com', 'googlevideo.com', 'ytimg.com'], 'domain(geosite: youtube)'],
  [['google.com', 'googleapis.com', 'gstatic.com'], 'domain(geosite: google)'],
  [['github.com', 'githubusercontent.com'], 'domain(geosite: github)'],
  [['apple.com', 'icloud.com', 'mzstatic.com'], 'domain(geosite: apple)'],
  [['microsoft.com', 'live.com', 'office.com'], 'domain(geosite: microsoft)'],
  [['steampowered.com', 'steamcommunity.com'], 'domain(geosite: steam)'],
  [['spotify.com', 'scdn.co'], 'domain(geosite: spotify)'],
  [['x.com', 'twimg.com'], 'domain(geosite: twitter)'],
  [['instagram.com', 'facebook.com', 'fbcdn.net', 'whatsapp.net'], 'domain(geosite: meta)'],
  [['openai.com', 'chatgpt.com'], 'domain(geosite: openai)'],
  [['claude.ai', 'anthropic.com'], 'domain(geosite: anthropic)'],
  [['reddit.com', 'redd.it'], 'domain(suffix: reddit.com, redd.it)'],
  [['wikipedia.org'], 'domain(geosite: wikimedia)'],
  [['cloudflare.com', 'one.one.one.one'], 'domain(geosite: cloudflare)'],
  [['taobao.com', 'tmall.com', 'alipay.com', 'alicdn.com'], 'domain(geosite: alibaba)'],
  [['weixin.qq.com', 'wechat.com'], 'domain(geosite: tencent)'],
  [['zhihu.com', 'zhimg.com'], 'domain(suffix: zhihu.com, zhimg.com)'],
  [['douyin.com', 'iqiyi.com', 'youku.com', 'weibo.com', 'jd.com', 'xiaohongshu.com', 'baidu.com'], 'domain(geosite: cn)'],
  [['steamcdn-a.akamaihd.net'], 'domain(keyword: steamcdn)'],
  [['speedtest.net'], 'domain(suffix: speedtest.net)'],
  [['ad.doubleclick.net', 'googlesyndication.com', 'adservice.google.com'], 'domain(geosite: category-ads-all)'],
  [['tailscale.com', 'controlplane.tailscale.com'], 'domain(geosite: tailscale)']
];
function ruleFor(domain: string): string | null {
  const name = domain.toLowerCase();
  for (const [suffixes, expression] of ruleTable) if (suffixes.some(s => name === s || name.endsWith('.' + s))) return expression;
  return null;
}

export function createFlow(connection: ConnectionSeed, network: 'tcp' | 'udp', observedAt: string, instanceId: string): FlowDetail {
  const input: FlowDetail['input'] = {
    src: connection.src ?? null,
    dst: connection.dst ?? null,
    domain: connection.domain ?? null,
    domain_source: connection.domain ? 'dns_mapping' : null,
    pid: null,
    process_path: null,
    src_mac: null,
    ingress: 'lan',
    domain_rule_ids: null,
    dscp: 0,
    mark: 0
  };
  const common = {observed_at: observedAt, elapsed_us: 0, generation_id: '40', evidence: 'observed' as const};
  const direct = connection.outbound === 'direct';
  const blocked = connection.state === 'blocked';
  const known = connection.domain ? ruleFor(connection.domain) : null;
  const expression =
    known ??
    (blocked
      ? 'domain(suffix: doubleclick.net)'
      : direct
        ? 'dip(geoip:cn)'
        : connection.domain
          ? 'domain(full: ' + connection.domain + ')'
          : 'fallback: ' + connection.outbound);
  const leaf = connection.outbound === 'resilient' ? 'sg-01' : connection.outbound === 'gaming' ? 'hk-02' : 'hk-01';
  const policy = connection.outbound === 'resilient' ? 'score' : connection.outbound === 'gaming' ? 'urltest' : 'selector';
  const steps: FlowStep[] = [
    {...common, seq: 1, stage: 'input', data: {values: {...input, pname: connection.pname}, source: direct || blocked ? 'kernel' : 'socket'}},
    {
      ...common,
      seq: 2,
      stage: 'route',
      data: {
        evaluation_id: 'eval-1',
        chain: 'traffic',
        plane: direct || blocked ? 'kernel' : 'userspace',
        rule_id: 'rule-1',
        rules: [{rule_id: 'rule-1', expression, result: 'matched', conditions: [], missing_inputs: []}],
        outbound: connection.outbound,
        must: blocked,
        mark: 0,
        input: null,
        dns_action: null
      }
    },
    {
      ...common,
      seq: 3,
      stage: 'datapath',
      data: {
        plane: direct || blocked ? 'kernel' : 'userspace',
        action: blocked ? 'drop' : direct ? 'activate_direct' : 'redirect',
        reason: 'route_selected',
        error: null
      }
    }
  ];
  if (!direct && !blocked) {
    steps.push({
      ...common,
      seq: steps.length + 1,
      stage: 'dial_mode',
      data: {
        configured: input.domain ? 'domain' : 'ip',
        effective_target: input.domain ? 'domain' : 'ip',
        domain: input.domain,
        domain_source: input.domain_source,
        verification: input.domain ? 'matched' : 'not_required',
        reason: input.domain ? 'dns_mapping_matches' : 'ip_target'
      }
    });
    if (input.domain)
      steps.push({
        ...common,
        seq: steps.length + 1,
        stage: 'dns',
        data: {
          lookup_id: 'lookup-1',
          parent_lookup_id: null,
          attempt_id: null,
          purpose: 'dial_target',
          name: input.domain,
          qtype: 'A',
          source: 'cache',
          upstream_transport: null,
          carrier_transport: null,
          cache: 'hit',
          cache_entry_id: null,
          upstream: null,
          route_evaluation_ids: [],
          status: 'NOERROR',
          addresses: [connection.dst!.split(':')[0]],
          selected_ip: connection.dst!.split(':')[0],
          error: null
        }
      });
    steps.push(
      {
        ...common,
        seq: steps.length + 1,
        stage: 'reroute',
        data: {performed: false, reason: 'no_new_routing_input', from_evaluation_id: 'eval-1', to_evaluation_id: null}
      },
      {
        ...common,
        seq: steps.length + 2,
        stage: 'outbound',
        data: {
          attempt_id: 'attempt-1',
          parent_attempt_id: null,
          kind: 'leaf',
          evaluation_id: 'eval-1',
          routing_source: 'evaluation',
          routed_outbound: connection.outbound,
          effective_outbound: connection.outbound,
          mode_override: 'none',
          selection_path: [
            {
              group_id: connection.outbound!,
              member_id: leaf,
              member_name: leaf,
              policy,
              reason: policy === 'selector' ? 'runtime_selection' : 'policy_selection',
              selection: {
                previous_member_id: null,
                metric: null,
                tolerance_ms: null,
                candidates: [
                  {
                    member_id: leaf,
                    member_name: leaf,
                    leaf_node_id: leaf,
                    leaf_node_name: leaf,
                    eligible: true,
                    sorting_latency_ms: null,
                    score: null,
                    selected: true,
                    reason: 'selected'
                  }
                ]
              }
            }
          ],
          leaf_node_id: leaf,
          leaf_node_name: leaf,
          target: input.domain ? input.domain + ':' + connection.dst!.split(':').at(-1) : input.dst,
          target_kind: input.domain ? 'domain' : 'ip',
          dial_ip: connection.dst!.split(':')[0],
          server_addr: '198.51.100.1:443',
          resolution_location: input.domain ? 'local_dns' : 'original_ip',
          status: 'succeeded',
          error: null
        }
      }
    );
  }
  if (!blocked)
    steps.push({
      ...common,
      seq: steps.length + 1,
      stage: 'connection',
      data: {state: 'active', reason: 'reply_received', milestone: 'first_reply', attempt_id: direct ? null : 'attempt-1', reply_received: true, error: null}
    });
  const timed = steps.map((step, i) => ({
    ...step,
    elapsed_us: i * 1200,
    observed_at: new Date(Date.parse(connection.started_at ?? observedAt) + i * 1.2).toISOString()
  }));
  const summary = {
    id: blocked && !connection.flow_id ? 'flow-blocked' : 'flow-' + connection.id,
    instance_id: instanceId,
    revision: 1,
    network,
    state: connection.state,
    pname: connection.pname,
    connection_id: blocked ? null : connection.id,
    outbound: connection.outbound,
    ...flowFields(input, timed),
    observed_by: connection.observed_by,
    started_at: connection.started_at,
    ended_at: blocked ? timed[timed.length - 1].observed_at : null,
    input
  };
  return direct
    ? {...summary, trace_status: 'partial', trace: {status: 'partial', missing: ['not_instrumented'], steps: timed}}
    : {...summary, trace_status: 'complete', trace: {status: 'complete', missing: [], steps: timed}};
}
