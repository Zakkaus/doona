// Mock data shaped like the doona contract (plans/doona.pages.v1.md). Replace with API clients later.
export type Mode = 'rule' | 'global' | 'direct';
export type Plane = '內核' | 'userspace' | '拒絕';

export const runtime = {
  version: 'honk 0.9.3 (d6ccc15f)',
  configPath: '/etc/honk/config.dae',
  mode: 'rule' as Mode,
  globalTarget: 'proxy',
  diskRevision: 41,
  activeRevision: 40,
  uptime: '3 天 4 小時',
  datapath: 'eBPF',
  lan: ['lan0'],
  wan: ['wan0'],
  window: '本次瀏覽器會話，12 分鐘'
};

export type Check = {id: string, name: string, requested: string, effective: string, ready: boolean, detail: string, restart?: boolean, fix?: string, manual?: string};
export const checks: Check[] = [
  {id: 'ebpf', name: 'eBPF datapath', requested: 'ebpf', effective: 'ebpf', ready: true, detail: 'tc 已掛 wan0、lan0；程式 honk_tc_egress / honk_tc_ingress'},
  {id: 'route', name: '路由發布', requested: 'table 2023', effective: 'table 2023', ready: true, detail: 'ip rule 已加；fwmark 0x8000000'},
  {id: 'tproxy', name: '透明監聽', requested: '0.0.0.0:12345', effective: '0.0.0.0:12345', ready: true, detail: 'TCP/UDP 監聽中'},
  {id: 'nfqueue', name: 'NFQUEUE', requested: 'queue 100', effective: '未掛', ready: false, detail: 'nfnetlink_queue 模組未載入；iptables 規則未加', restart: true, fix: 'modprobe nfnetlink_queue 後重啟 honk', manual: 'https://github.com/daeuniverse/honk/wiki/nfqueue'},
  {id: 'dns', name: '獨立 DNS', requested: ':53', effective: ':53', ready: true, detail: '上游 2 個：tcp://1.1.1.1、udp://223.5.5.5'},
  {id: 'api', name: 'Clash API', requested: '127.0.0.1:9090', effective: '127.0.0.1:9090', ready: true, detail: 'secret 為空，只綁本機'},
  {id: 'ui', name: '內嵌 UI', requested: '/ui/', effective: '未啟用', ready: false, detail: 'external-ui 未設定；doona 目前以 local-controller 方式提供', fix: '設定 external-ui 或用 local-controller'}
];

export type Conn = {id: string, dst: string, host?: string, src: string, mac?: string, out: string, chain: string[], rule: string, ruleRef?: string, plane: Plane, up: string, down: string, age: string, proto: 'tcp' | 'udp', canTerminate: boolean};
export const conns: Conn[] = [
  {id: '1', dst: '149.154.167.220:443', host: 'api.telegram.org', src: '10.0.0.12', mac: 'aa:bb:cc:dd:ee:01', out: 'proxy', chain: ['proxy', 'hk-01'], rule: 'domain(geosite: telegram) -> proxy', ruleRef: 'config.dae:42', plane: 'userspace', up: '84 KB', down: '1.2 MB', age: '4m 12s', proto: 'tcp', canTerminate: true},
  {id: '2', dst: '120.92.78.14:443', host: 'cdn.bilibili.com', src: '10.0.0.7', mac: 'aa:bb:cc:dd:ee:02', out: 'direct', chain: ['direct'], rule: 'domain(geosite: cn) -> direct', ruleRef: 'config.dae:41', plane: '內核', up: '1.1 MB', down: '83 MB', age: '12m 03s', proto: 'tcp', canTerminate: false},
  {id: '3', dst: '52.84.19.3:443', src: '10.0.0.7', mac: 'aa:bb:cc:dd:ee:02', out: 'proxy', chain: ['proxy', 'hk-01'], rule: 'fallback: proxy', ruleRef: 'config.dae:44', plane: '內核', up: '12 KB', down: '312 KB', age: '18s', proto: 'tcp', canTerminate: false},
  {id: '4', dst: '142.250.66.46:443', host: 'doubleclick.net', src: '10.0.0.31', out: 'block', chain: ['block'], rule: 'domain(suffix: doubleclick.net) -> block', ruleRef: 'config.dae:38', plane: '拒絕', up: '0', down: '0', age: '—', proto: 'tcp', canTerminate: false},
  {id: '5', dst: '1.1.1.1:53', src: '10.0.0.12', mac: 'aa:bb:cc:dd:ee:01', out: 'direct', chain: ['direct'], rule: 'l4proto(udp) && dport(53) -> direct(must)', ruleRef: 'config.dae:39', plane: '內核', up: '2 KB', down: '2 KB', age: '1s', proto: 'udp', canTerminate: false},
  {id: '6', dst: '104.16.132.229:443', host: 'discord.com', src: '10.0.0.31', out: 'proxy', chain: ['proxy', 'hk-01'], rule: 'domain(geosite: discord) -> proxy', ruleRef: 'rules.dae:7', plane: 'userspace', up: '210 KB', down: '3.4 MB', age: '9m 40s', proto: 'tcp', canTerminate: true},
  {id: '7', dst: '203.0.113.9:8443', src: '10.0.0.20', mac: 'aa:bb:cc:dd:ee:20', out: 'resilient', chain: ['resilient', 'sg-01'], rule: 'fallback: resilient', ruleRef: 'config.dae:44', plane: 'userspace', up: '40 KB', down: '96 KB', age: '2m 05s', proto: 'tcp', canTerminate: true},
  {id: '8', dst: '10.0.0.1:53', src: '10.0.0.20', mac: 'aa:bb:cc:dd:ee:20', out: 'direct', chain: ['direct'], rule: 'dip(geoip: private) -> direct(must)', ruleRef: 'config.dae:40', plane: '內核', up: '1 KB', down: '3 KB', age: '3s', proto: 'udp', canTerminate: false}
];

export type Client = {ip: string, mac?: string, active: number, sampled: string, firstSeen: string};
export const clients: Client[] = [
  {ip: '10.0.0.7', mac: 'aa:bb:cc:dd:ee:02', active: 2, sampled: '84 MB', firstSeen: '12m 前'},
  {ip: '10.0.0.12', mac: 'aa:bb:cc:dd:ee:01', active: 2, sampled: '1.3 MB', firstSeen: '4m 前'},
  {ip: '10.0.0.20', mac: 'aa:bb:cc:dd:ee:20', active: 2, sampled: '140 KB', firstSeen: '2m 前'},
  {ip: '10.0.0.31', active: 2, sampled: '3.6 MB', firstSeen: '9m 前'}
];

export type Node = {name: string, tcp?: number, udp?: number, v6: boolean, source: string, alive: boolean};
export type Group = {name: string, policy: 'selector' | 'urltest' | 'loadbalance' | 'fallback' | 'score', selected?: string, members: string[], leaf: string, nodes: Node[]};
export const groups: Group[] = [
  {name: 'proxy', policy: 'selector', selected: 'hk-01', members: ['hk-01', 'hk-02', 'sg-01', 'jp-01', 'us-01', 'resilient'], leaf: 'hk-01', nodes: [
    {name: 'hk-01', tcp: 84, udp: 91, v6: true, source: 'sub-a', alive: true}, {name: 'hk-02', tcp: 91, udp: 88, v6: true, source: 'sub-a', alive: true}, {name: 'sg-01', tcp: 63, udp: 70, v6: false, source: 'sub-a', alive: true}, {name: 'jp-01', v6: false, source: 'sub-b', alive: false}, {name: 'us-01', tcp: 188, udp: 201, v6: true, source: 'sub-b', alive: true}]},
  {name: 'resilient', policy: 'score', members: ['hk-01', 'sg-01', 'us-01'], leaf: 'sg-01', nodes: [
    {name: 'hk-01', tcp: 84, udp: 91, v6: true, source: 'sub-a', alive: true}, {name: 'sg-01', tcp: 63, udp: 70, v6: false, source: 'sub-a', alive: true}, {name: 'us-01', tcp: 188, udp: 201, v6: true, source: 'sub-b', alive: true}]},
  {name: 'gaming', policy: 'urltest', members: ['jp-01', 'hk-02'], leaf: 'hk-02', nodes: [
    {name: 'jp-01', v6: false, source: 'sub-b', alive: false}, {name: 'hk-02', tcp: 91, udp: 88, v6: true, source: 'sub-a', alive: true}]}
];

export type Rule = {id: string, n: number, cond: string, target: string, must: boolean, source: string, note: string, editable: boolean, generated?: boolean};
export const rules: Rule[] = [
  {id: 'r1', n: 1, cond: 'domain(suffix: doubleclick.net)', target: 'block', must: false, source: 'config.dae:38', note: '廣告', editable: true},
  {id: 'r2', n: 2, cond: 'pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53)', target: 'direct', must: true, source: 'config.dae:39', note: '', editable: true},
  {id: 'r3', n: 3, cond: 'dip(geoip: private)', target: 'direct', must: true, source: 'config.dae:40', note: 'LAN', editable: true},
  {id: 'r4', n: 4, cond: 'domain(geosite: cn)', target: 'direct', must: false, source: 'config.dae:41', note: '', editable: true},
  {id: 'r5', n: 5, cond: 'domain(geosite: telegram)', target: 'proxy', must: false, source: 'config.dae:42', note: '', editable: true},
  {id: 'r6', n: 6, cond: 'mac(aa:bb:cc:dd:ee:ff) && ipversion(4)', target: 'direct', must: false, source: 'rules.dae:3', note: '電視', editable: true},
  {id: 'r7', n: 7, cond: 'domain(geosite: discord)', target: 'proxy', must: false, source: 'rules.dae:7', note: '', editable: true},
  {id: 'r8', n: 8, cond: 'sip(10.0.0.0/24) && dport(25)', target: 'block', must: false, source: '生成，subscription policy', note: '', editable: false, generated: true}
];
export const fallbackRule = {target: 'resilient', source: 'config.dae:44'};

export type CacheEntry = {id: string, qname: string, qtype: string, kind: '正' | '負', upstream: string, expires: string};
export const dnsCache: CacheEntry[] = [
  {id: 'c1', qname: 'api.telegram.org', qtype: 'A', kind: '正', upstream: 'tcp://1.1.1.1', expires: '4m 02s'},
  {id: 'c2', qname: 'cdn.bilibili.com', qtype: 'A', kind: '正', upstream: 'udp://223.5.5.5', expires: '58s'},
  {id: 'c3', qname: 'cdn.bilibili.com', qtype: 'AAAA', kind: '負', upstream: 'udp://223.5.5.5', expires: '58s'},
  {id: 'c4', qname: 'doubleclick.net', qtype: 'A', kind: '正', upstream: '本機，block', expires: '—'},
  {id: 'c5', qname: 'discord.com', qtype: 'HTTPS', kind: '負', upstream: 'tcp://1.1.1.1', expires: '9m 11s'}
];

export type Sub = {id: string, name: string, source: string, ready: boolean, lastTry: string, lastOk: string, published: string, nodes?: number, error?: string, refreshable: boolean};
export const subs: Sub[] = [
  {id: 's1', name: 'sub-a', source: 'https://example.net/sub/a', ready: true, lastTry: '10 分鐘前', lastOk: '10 分鐘前', published: 'r40', nodes: 38, refreshable: true},
  {id: 's2', name: 'sub-b', source: 'https://example.org/b.txt', ready: false, lastTry: '3 分鐘前', lastOk: '2 天前', published: 'r33', nodes: 7, error: 'HTTP 503', refreshable: true},
  {id: 's3', name: 'local-nodes', source: '/etc/honk/nodes.dae', ready: true, lastTry: '—', lastOk: '—', published: 'r40', nodes: 2, refreshable: false}
];
export const geo = [
  {name: 'geoip.dat', path: '/usr/share/honk/geoip.dat', ready: true, size: '9.8 MB', mtime: '2026-09-01'},
  {name: 'geosite.dat', path: '/usr/share/honk/geosite.dat', ready: true, size: '4.1 MB', mtime: '2026-09-01'}
];

export type Src = {id: string, path: string, editable: boolean, lines: string[]};
export const sources: Src[] = [
  {id: 'main', path: '/etc/honk/config.dae', editable: true, lines: [
    'global {', '    tproxy_port: 12345', '    log_level: info', '    lan_interface: lan0', '    wan_interface: wan0', '    dial_mode: domain', '}', '',
    'dns {', '    upstream {', '        alidns: \'udp://223.5.5.5:53\'', '        cf: \'tcp://1.1.1.1:53\'', '    }', '    routing {', '        request {', '            qname(geosite: cn) -> alidns', '            fallback: cf', '        }', '    }', '}', '',
    'subscription {', '    sub-a: \'https://example.net/sub/a\'', '    sub-b: \'https://example.org/b.txt\'', '}', '',
    'group {', '    proxy { policy: min_moving_avg }', '    resilient { policy: score }', '    gaming { filter: name(keyword: jp) policy: urltest }', '}', '',
    'include { rules.dae }', '',
    'routing {', '    # 廣告', '    domain(suffix: doubleclick.net) -> block', '    pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53) -> direct(must)', '    dip(geoip: private) -> direct(must)', '    domain(geosite: cn) -> direct', '    domain(geosite: telegram) -> proxy', '    domain(geosite: category-games@cn) -> gaming2', '    fallback: resilient', '}']},
  {id: 'rules', path: '/etc/honk/rules.dae', editable: true, lines: ['# 家裡的裝置', 'routing {', '    mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct', '    # discord 走代理', '    domain(geosite: discord) -> proxy', '}']}
];
export const diagnostics = [{source: 'main', line: 43, level: '錯誤', msg: '出站 gaming2 不存在；可用的組：proxy、resilient、gaming'}];
export const restartItems = ['global.tproxy_port', 'global.lan_interface', 'global.wan_interface'];

export type Ev = {id: string, t: string, kind: 'reload' | '訂閱' | '探測' | 'datapath' | 'operation', level: 'info' | 'warn' | 'error', msg: string, ref?: string};
export const events: Ev[] = [
  {id: 'e1', t: '14:02:11', kind: 'reload', level: 'info', msg: 'reload 完成，r40，45 個節點，8 條規則', ref: '#/config'},
  {id: 'e2', t: '14:02:10', kind: '訂閱', level: 'warn', msg: 'sub-b 刷新失敗，HTTP 503，沿用 r33', ref: '#/resources'},
  {id: 'e3', t: '13:58:40', kind: '探測', level: 'info', msg: 'proxy，5 個成員測完，jp-01 逾時', ref: '#/policies'},
  {id: 'e4', t: '13:41:02', kind: 'datapath', level: 'error', msg: 'NFQUEUE 未就緒，nfnetlink_queue 未載入', ref: '#/overview'},
  {id: 'e5', t: '13:40:59', kind: 'operation', level: 'info', msg: 'diagnose op-1183 完成，7 項檢查，2 項失敗', ref: '#/overview'},
  {id: 'e6', t: '11:12:07', kind: 'reload', level: 'info', msg: '啟動，honk 0.9.3，eBPF datapath 已掛 wan0、lan0'}
];
export const clashLog = ['[INFO] tcp 10.0.0.12:51422 -> api.telegram.org:443 match geosite(telegram) using proxy[hk-01]', '[INFO] udp 10.0.0.12:60001 -> 1.1.1.1:53 match l4proto(udp)&&dport(53) using direct', '[WARN] dns query discord.com HTTPS negative cached', '[INFO] tcp 10.0.0.31:44012 -> doubleclick.net:443 match geosite(ads) using block'];

// Active connection count over the same window, one sample every 10 s.
export const connSeries: number[] = Array.from({length: 73}, (_, i) => Math.max(2, Math.round(8 + 2.5 * Math.sin((i - 72) / 9) + (i > 40 && i < 52 ? 4 * Math.sin(((i - 40) / 12) * Math.PI) : 0))));
// Throughput samples for the traffic chart: one point every 10 s over the 12-minute window, KB/s. Deterministic so the mock is stable.
export const throughput: Array<{t: number, up: number, down: number}> = Array.from({length: 73}, (_, i) => {
  const x = i / 72;
  const burst = i > 40 && i < 52 ? 1 : 0;
  const down = 1400 + 2400 * Math.abs(Math.sin(x * 6.8 + 0.4)) + 6000 * burst * Math.sin(((i - 40) / 12) * Math.PI) + 60 * Math.sin(i * 0.9);
  const up = 140 + 220 * Math.abs(Math.cos(x * 5.3)) + 900 * burst * Math.sin(((i - 40) / 12) * Math.PI) + 8 * Math.sin(i * 1.1);
  return {t: i * 10, up: Math.max(0, Math.round(up)), down: Math.max(0, Math.round(down))};
});
