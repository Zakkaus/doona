import type {Connection, ConnectionList, FlowDetail, DnsCacheList} from '../../model';
import {createFlow, flowFields, type ConnectionSeed} from '../flows';
import {ago, ahead, observedAt, instanceId} from './clock';
const AGES: Record<string, number> = {'1': 252, '2': 723, '3': 18, '4': 5, '5': 1, '6': 580, '7': 61, '8': 3};
export const flows: FlowDetail[] = [];
function connection(
  id: string,
  dst: string,
  src: string,
  outbound: string,
  download: string,
  upload: string,
  domain: string | null = null,
  network: 'tcp' | 'udp' = 'tcp'
): Connection {
  const seed: ConnectionSeed = {
    id,
    flow_id: ['1', '2', '5'].includes(id) ? 'flow-' + id : null,
    pname: null,
    state: outbound === 'block' ? 'blocked' : 'active',
    src,
    dst,
    domain,
    outbound,
    started_at: ago(AGES[id] ?? 60),
    observed_by: outbound === 'direct' || outbound === 'block' ? 'ebpf' : 'userspace',
    upload_bytes: upload,
    download_bytes: download,
    upload_bytes_per_second: '0',
    download_bytes_per_second: '0'
  };
  const flow = createFlow(seed, network, observedAt, instanceId);
  flows.push(flow);
  return {...seed, ...flowFields(flow.input, flow.trace.steps)};
}
export const connections: ConnectionList = {
  observed_at: observedAt,
  instance_id: instanceId,
  visibility: 'full',
  truncated: false,
  total_tcp: 6,
  total_udp: 2,
  tcp: [
    connection('1', '149.154.167.220:443', '10.0.0.12', 'proxy', '1200000', '84000', 'api.telegram.org'),
    connection('2', '120.92.78.14:443', '10.0.0.7', 'direct', '1099998000', '1100000', 'cdn.bilibili.com'),
    connection('3', '52.84.19.3:443', '10.0.0.7', 'proxy', '307400000', '12000'),
    connection('4', '142.250.66.46:443', '10.0.0.31', 'block', '0', '0', 'doubleclick.net'),
    connection('6', '104.16.132.229:443', '10.0.0.31', 'proxy', '3400000', '210000', 'discord.com'),
    connection('7', '203.0.113.9:8443', '10.0.0.20', 'resilient', '96000', '40000')
  ],
  udp: [
    connection('5', '1.1.1.1:53', '10.0.0.12', 'direct', '2000', '2000', null, 'udp'),
    connection('8', '10.0.0.1:53', '10.0.0.20', 'gaming', '12000', '1000', null, 'udp')
  ]
};

export const flowDroppedRecords = '3';
export const flowSummaryOmitsInput: Record<string, true> = {'flow-unobserved': true};
const unobservedFlow: FlowDetail = {
  ...flows[0],
  id: 'flow-unobserved',
  connection_id: null,
  state: 'observed',
  outbound: null,
  chain: [],
  chain_source: 'unknown',
  rule_id: null,
  rule_expression: null,
  rule_source: 'unknown',
  trace_status: 'partial',
  trace: {status: 'partial', missing: ['not_instrumented'], steps: []}
};
flows.push(unobservedFlow, {
  ...unobservedFlow,
  id: 'flow-ipv6',
  input: {...unobservedFlow.input, src: '[2001:db8::12]:5000'}
});
// Retained terminal flows without a live connection: the routing view shows a config with many rules.
function retained(id: string, domain: string, outbound: string, network: 'tcp' | 'udp' = 'tcp') {
  const seed: ConnectionSeed = {
    id,
    flow_id: 'flow-' + id,
    pname: null,
    state: outbound === 'block' ? 'blocked' : 'closed',
    src: '10.0.0.' + (10 + (Number(id.replace(/\D/g, '')) % 40)) + ':' + (40000 + Number(id.replace(/\D/g, ''))),
    dst: '203.0.113.' + (Number(id.replace(/\D/g, '')) % 250) + ':443',
    domain,
    outbound,
    started_at: ago(600 + Number(id.replace(/\D/g, '')) * 7),
    observed_by: outbound === 'direct' || outbound === 'block' ? 'ebpf' : 'userspace',
    upload_bytes: '4096',
    download_bytes: '65536',
    upload_bytes_per_second: '0',
    download_bytes_per_second: '0'
  };
  flows.push(createFlow(seed, network, observedAt, instanceId));
}
for (const [id, domain, outbound] of [
  ['r01', 'www.netflix.com', 'proxy'],
  ['r02', 'rr1---sn-ab5l6n7z.googlevideo.com', 'proxy'],
  ['r03', 'www.google.com', 'proxy'],
  ['r04', 'raw.githubusercontent.com', 'proxy'],
  ['r05', 'gateway.icloud.com', 'direct'],
  ['r06', 'login.live.com', 'proxy'],
  ['r07', 'store.steampowered.com', 'proxy'],
  ['r08', 'api.spotify.com', 'proxy'],
  ['r09', 'pbs.twimg.com', 'proxy'],
  ['r10', 'scontent.cdninstagram.com', 'proxy'],
  ['r11', 'chatgpt.com', 'proxy'],
  ['r12', 'claude.ai', 'proxy'],
  ['r13', 'www.reddit.com', 'proxy'],
  ['r14', 'en.wikipedia.org', 'proxy'],
  ['r15', 'api.cloudflare.com', 'proxy'],
  ['r16', 'www.taobao.com', 'direct'],
  ['r17', 'weixin.qq.com', 'direct'],
  ['r18', 'www.zhihu.com', 'direct'],
  ['r19', 'www.douyin.com', 'direct'],
  ['r20', 'www.iqiyi.com', 'direct'],
  ['r21', 'www.jd.com', 'direct'],
  ['r22', 'www.xiaohongshu.com', 'direct'],
  ['r23', 'www.baidu.com', 'direct'],
  ['r24', 'steamcdn-a.akamaihd.net', 'proxy'],
  ['r25', 'www.speedtest.net', 'direct'],
  ['r26', 'ad.doubleclick.net', 'block'],
  ['r27', 'pagead2.googlesyndication.com', 'block'],
  ['r28', 'controlplane.tailscale.com', 'direct'],
  ['r29', 'www.youtube.com', 'proxy'],
  ['r30', 'graph.facebook.com', 'proxy']
] as const)
  retained(id, domain, outbound);

export function connectionFixtures() {
  const templates = [
    ...connections.tcp.map(connection => ({connection, network: 'tcp' as const})),
    ...connections.udp.map(connection => ({connection, network: 'udp' as const}))
  ].sort((a, b) => Number(a.connection.id) - Number(b.connection.id));
  const snapshot: ConnectionList = {...connections, tcp: [], udp: [], total_tcp: 0, total_udp: 0};
  const recorded: FlowDetail[] = [];
  for (let i = 0; i < 1200; i++) {
    const {connection, network} = templates[i % templates.length];
    const suffix = String(i + 1).padStart(4, '0');
    const row: Connection = {
      ...connection,
      id: 'c-' + suffix,
      started_at: ago((i * 3600) / 1200),
      flow_id: (i + 1) % 3 === 0 ? 'flow-c-' + suffix : null
    };
    snapshot[network].push(row);
    if (row.flow_id) {
      const flow = createFlow(row, network, observedAt, instanceId);
      recorded.push({...flow, id: row.flow_id, connection_id: row.id});
    }
  }
  snapshot.total_tcp = snapshot.tcp.length;
  snapshot.total_udp = snapshot.udp.length;
  return {connections: snapshot, flows: recorded};
}
export const dnsCache: DnsCacheList = {
  observed_at: observedAt,
  coverage: {positive: true, negative: true, persistent: false},
  total: 5,
  next_cursor: null,
  entries: [
    {
      entry_id: 'c1',
      domain: 'api.telegram.org.',
      type: 'A',
      class: 'IN',
      status: 'NOERROR',
      answers: [{name: 'api.telegram.org.', type: 'A', class: 'IN', ttl: 240, data: '149.154.167.220'}],
      expires_at: ahead(240),
      stale_until: null
    },
    {
      entry_id: 'c2',
      domain: 'cdn.bilibili.com.',
      type: 'A',
      class: 'IN',
      status: 'NOERROR',
      answers: [{name: 'cdn.bilibili.com.', type: 'A', class: 'IN', ttl: 60, data: '120.92.78.14'}],
      expires_at: ahead(60),
      stale_until: ahead(120)
    },
    {entry_id: 'c3', domain: 'cdn.bilibili.com.', type: 'AAAA', class: 'IN', status: 'NXDOMAIN', expires_at: ahead(60), stale_until: null},
    {
      entry_id: 'c4',
      domain: 'doubleclick.net.',
      type: 'A',
      class: 'IN',
      status: 'NOERROR',
      answers: [{name: 'doubleclick.net.', type: 'A', class: 'IN', ttl: 3600, data: '0.0.0.0'}],
      expires_at: ahead(3600),
      stale_until: null
    },
    {entry_id: 'c5', domain: 'discord.com.', type: 'HTTPS', class: 'IN', status: 'NXDOMAIN', expires_at: ahead(540), stale_until: null}
  ]
};
