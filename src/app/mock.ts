// Compatibility fixtures remain for pages without native API resources.
// Retained for app/pages/Activity.tsx and rp/Activity.tsx.
export type Mode = 'rule' | 'global' | 'direct';
// Retained for app/ui.tsx.
export type Plane = '內核' | 'userspace' | '拒絕';

// Retained for both Activity, Clients, ConfigPage, Rules, Validate pages and RuleDialog components.
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

// Retained for app/pages/Activity.tsx and rp/Activity.tsx.
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

type Conn = {id: string, dst: string, host?: string, src: string, mac?: string, out: string, chain: string[], rule: string, ruleRef?: string, plane: Plane, up: string, down: string, age: string, proto: 'tcp' | 'udp', canTerminate: boolean};
// Retained for app/SearchTrigger.tsx and rp/Shell.tsx.
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

// Retained for both Clients pages.
export type Client = {ip: string, mac?: string, active: number, sampled: string, firstSeen: string};
export const clients: Client[] = [
  {ip: '10.0.0.7', mac: 'aa:bb:cc:dd:ee:02', active: 2, sampled: '84 MB', firstSeen: '12m 前'},
  {ip: '10.0.0.12', mac: 'aa:bb:cc:dd:ee:01', active: 2, sampled: '1.3 MB', firstSeen: '4m 前'},
  {ip: '10.0.0.20', mac: 'aa:bb:cc:dd:ee:20', active: 2, sampled: '140 KB', firstSeen: '2m 前'},
  {ip: '10.0.0.31', active: 2, sampled: '3.6 MB', firstSeen: '9m 前'}
];

type Node = {name: string, tcp?: number, udp?: number, v6: boolean, source: string, alive: boolean};
type Group = {name: string, policy: 'selector' | 'urltest' | 'loadbalance' | 'fallback' | 'score', selected?: string, members: string[], leaf: string, nodes: Node[]};
// Retained for both RuleDialog components, app/SearchTrigger.tsx, and rp/Shell.tsx.
export const groups: Group[] = [
  {name: 'proxy', policy: 'selector', selected: 'hk-01', members: ['hk-01', 'hk-02', 'sg-01', 'jp-01', 'us-01', 'resilient'], leaf: 'hk-01', nodes: [
    {name: 'hk-01', tcp: 84, udp: 91, v6: true, source: 'sub-a', alive: true}, {name: 'hk-02', tcp: 91, udp: 88, v6: true, source: 'sub-a', alive: true}, {name: 'sg-01', tcp: 63, udp: 70, v6: false, source: 'sub-a', alive: true}, {name: 'jp-01', v6: false, source: 'sub-b', alive: false}, {name: 'us-01', tcp: 188, udp: 201, v6: true, source: 'sub-b', alive: true}]},
  {name: 'resilient', policy: 'score', members: ['hk-01', 'sg-01', 'us-01'], leaf: 'sg-01', nodes: [
    {name: 'hk-01', tcp: 84, udp: 91, v6: true, source: 'sub-a', alive: true}, {name: 'sg-01', tcp: 63, udp: 70, v6: false, source: 'sub-a', alive: true}, {name: 'us-01', tcp: 188, udp: 201, v6: true, source: 'sub-b', alive: true}]},
  {name: 'gaming', policy: 'urltest', members: ['jp-01', 'hk-02'], leaf: 'hk-02', nodes: [
    {name: 'jp-01', v6: false, source: 'sub-b', alive: false}, {name: 'hk-02', tcp: 91, udp: 88, v6: true, source: 'sub-a', alive: true}]}
];

// A large airport-style subscription (100 nodes by default; localStorage doona-mock-big overrides the count, 0 removes it).
function bigGroup(count: number): Group {
  const regions: Array<[string, number]> = [['香港', 60], ['台灣', 40], ['日本', 30], ['新加坡', 40], ['美國', 160], ['韓國', 50], ['英國', 120], ['德國', 130], ['澳洲', 150], ['土耳其', 170]];
  const tags = ['IPLC', 'BGP', '家寬', '解鎖', '0.5x', '2x', '流媒體', ''];
  let seed = 7; const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    const [region, base] = regions[i % regions.length];
    const n = String(Math.floor(i / regions.length) + 1).padStart(2, '0');
    const tag = tags[Math.floor(rnd() * tags.length)];
    const alive = rnd() > 0.06;
    const tcp = Math.round(base + rnd() * base * 0.8);
    nodes.push({name: region + ' ' + n + (tag ? ' · ' + tag : ''), tcp: alive ? tcp : undefined, udp: alive ? tcp + Math.round(rnd() * 20) : undefined, v6: rnd() > 0.5, source: 'sub-c', alive});
  }
  return {name: 'airport', policy: 'selector', selected: nodes[0].name, members: nodes.map(n => n.name), leaf: nodes[0].name, nodes};
}
const bigCount = (() => { try { const v = localStorage.getItem('doona-mock-big'); return v == null ? 100 : Number(v) || 0; } catch { return 100; } })();
if (bigCount > 0) groups.push(bigGroup(bigCount));

// Retained for both Rules pages, app/SearchTrigger.tsx, and rp/Shell.tsx.
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
// Retained for both Rules pages.
export const fallbackRule = {target: 'resilient', source: 'config.dae:44'};

// Retained for both Resources pages.
export type Sub = {id: string, name: string, source: string, ready: boolean, lastTry: string, lastOk: string, published: string, nodes?: number, error?: string, refreshable: boolean};
export const subs: Sub[] = [
  {id: 's1', name: 'sub-a', source: 'https://example.net/sub/a', ready: true, lastTry: '10 分鐘前', lastOk: '10 分鐘前', published: 'r40', nodes: 38, refreshable: true},
  {id: 's2', name: 'sub-b', source: 'https://example.org/b.txt', ready: false, lastTry: '3 分鐘前', lastOk: '2 天前', published: 'r33', nodes: 7, error: 'HTTP 503', refreshable: true},
  {id: 's3', name: 'local-nodes', source: '/etc/honk/nodes.dae', ready: true, lastTry: '—', lastOk: '—', published: 'r40', nodes: 2, refreshable: false}
];
// Retained for both Resources pages.
export const geo = [
  {name: 'geoip.dat', path: '/usr/share/honk/geoip.dat', ready: true, size: '9.8 MB', mtime: '2026-09-01'},
  {name: 'geosite.dat', path: '/usr/share/honk/geosite.dat', ready: true, size: '4.1 MB', mtime: '2026-09-01'}
];

// Retained for both ConfigPage and Validate pages.
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
// Retained for both ConfigPage and Validate pages.
export type Diag = {id: string, source: string, line: number, level: 'error' | 'warn' | 'info', msg: string, why: string, action: '拒絕' | '用預設' | '夾到邊界' | '照收'};
export const diagnostics: Diag[] = [
  {id: 'd1', source: 'main', line: 43, level: 'error', msg: '出站 gaming2 不存在；可用的組：proxy、resilient、gaming', why: '猜錯會改變流量去向', action: '拒絕'},
  {id: 'd2', source: 'rules', line: 3, level: 'error', msg: 'ipversion(4) 之後多了一個 )', why: '結構不完整，整段規則會被丟掉', action: '拒絕'},
  {id: 'd3', source: 'main', line: 27, level: 'warn', msg: 'check_tolerance: 1m 超出範圍（最大 10s）', why: '只影響 URLTest 換節點的時序', action: '夾到邊界'},
  {id: 'd4', source: 'main', line: 24, level: 'warn', msg: 'sub-b 訂閱回應 HTTP 503，沿用 r33 的快取', why: '節點清單可能過時', action: '照收'},
  {id: 'd5', source: 'main', line: 3, level: 'info', msg: 'log_level 未設定時採用 info', why: '未表達意圖，用預設永遠正確', action: '用預設'},
  {id: 'd6', source: 'main', line: 21, level: 'info', msg: '訂閱 sub-a 有 3 個節點同名，已加上序號後綴', why: '不影響路由，只影響顯示', action: '照收'}
];
// Retained for both Validate pages.
export const restartItems = ['global.tproxy_port', 'global.lan_interface', 'global.wan_interface'];
// Retained for both Validate pages.
export type Pending = {key: string, from: string, to: string, restart: boolean};
export const pending: Pending[] = [
  {key: 'global.log_level', from: 'info', to: 'debug', restart: false},
  {key: 'global.tproxy_port', from: '12345', to: '12346', restart: true},
  {key: 'routing', from: '11 條', to: '12 條', restart: false}
];

// Retained for app/pages/Activity.tsx and rp/Activity.tsx.
export type Ev = {id: string, t: string, kind: 'reload' | '訂閱' | '探測' | 'datapath' | 'operation', level: 'info' | 'warn' | 'error', msg: string, ref?: string};
export const events: Ev[] = [
  {id: 'e1', t: '14:02:11', kind: 'reload', level: 'info', msg: 'reload 完成，r40，45 個節點，8 條規則', ref: '#/config'},
  {id: 'e2', t: '14:02:10', kind: '訂閱', level: 'warn', msg: 'sub-b 刷新失敗，HTTP 503，沿用 r33', ref: '#/resources'},
  {id: 'e3', t: '13:58:40', kind: '探測', level: 'info', msg: 'proxy，5 個成員測完，jp-01 逾時', ref: '#/policies'},
  {id: 'e4', t: '13:41:02', kind: 'datapath', level: 'error', msg: 'NFQUEUE 未就緒，nfnetlink_queue 未載入', ref: '#/overview'},
  {id: 'e5', t: '13:40:59', kind: 'operation', level: 'info', msg: 'diagnose op-1183 完成，7 項檢查，2 項失敗', ref: '#/overview'},
  {id: 'e6', t: '11:12:07', kind: 'reload', level: 'info', msg: '啟動，honk 0.9.3，eBPF datapath 已掛 wan0、lan0'}
];
// Retained for the Clash tab in both Events pages.
export const clashLog = ['[INFO] tcp 10.0.0.12:51422 -> api.telegram.org:443 match geosite(telegram) using proxy[hk-01]', '[INFO] udp 10.0.0.12:60001 -> 1.1.1.1:53 match l4proto(udp)&&dport(53) using direct', '[WARN] dns query discord.com HTTPS negative cached', '[INFO] tcp 10.0.0.31:44012 -> doubleclick.net:443 match geosite(ads) using block'];

