// Demo data for the Clash-compatible pages until the adapter lands.
export const runtime = {
  diskRevision: 41,
  activeRevision: 40
};

type Sub = {
  id: string;
  name: string;
  source: string;
  ready: boolean;
  lastTry: string;
  lastOk: string;
  published: string;
  nodes?: number;
  error?: string;
  refreshable: boolean;
};
export const subs: Sub[] = [
  {
    id: 's1',
    name: 'sub-a',
    source: 'https://example.net/sub/a',
    ready: true,
    lastTry: '10 分鐘前',
    lastOk: '10 分鐘前',
    published: 'r40',
    nodes: 38,
    refreshable: true
  },
  {
    id: 's2',
    name: 'sub-b',
    source: 'https://example.org/b.txt',
    ready: false,
    lastTry: '3 分鐘前',
    lastOk: '2 天前',
    published: 'r33',
    nodes: 7,
    error: 'HTTP 503',
    refreshable: true
  },
  {id: 's3', name: 'local-nodes', source: '/etc/honk/nodes.dae', ready: true, lastTry: '—', lastOk: '—', published: 'r40', nodes: 2, refreshable: false}
];
export const geo = [
  {name: 'geoip.dat', path: '/usr/share/honk/geoip.dat', ready: true, size: '9.8 MB', mtime: '2026-09-01'},
  {name: 'geosite.dat', path: '/usr/share/honk/geosite.dat', ready: true, size: '4.1 MB', mtime: '2026-09-01'}
];

type Src = {id: string; path: string; editable: boolean; lines: string[]};
export const sources: Src[] = [
  {
    id: 'main',
    path: '/etc/honk/config.dae',
    editable: true,
    lines: [
      'global {',
      '    tproxy_port: 12345',
      '    log_level: info',
      '    lan_interface: lan0',
      '    wan_interface: wan0',
      '    dial_mode: domain',
      '}',
      '',
      'dns {',
      '    upstream {',
      "        alidns: 'udp://223.5.5.5:53'",
      "        cf: 'tcp://1.1.1.1:53'",
      '    }',
      '    routing {',
      '        request {',
      '            qname(geosite: cn) -> alidns',
      '            fallback: cf',
      '        }',
      '    }',
      '}',
      '',
      'subscription {',
      "    sub-a: 'https://example.net/sub/a'",
      "    sub-b: 'https://example.org/b.txt'",
      '}',
      '',
      'group {',
      '    proxy { policy: min_moving_avg }',
      '    resilient { policy: score }',
      '    gaming { filter: name(keyword: jp) policy: urltest }',
      '}',
      '',
      'include { rules.dae }',
      '',
      'routing {',
      '    # 廣告',
      '    domain(suffix: doubleclick.net) -> block',
      '    pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53) -> direct(must)',
      '    dip(geoip: private) -> direct(must)',
      '    domain(geosite: cn) -> direct',
      '    domain(geosite: telegram) -> proxy',
      '    domain(geosite: category-games@cn) -> gaming2',
      '    fallback: resilient',
      '}'
    ]
  },
  {
    id: 'rules',
    path: '/etc/honk/rules.dae',
    editable: true,
    lines: [
      '# 家裡的裝置',
      'routing {',
      '    mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct',
      '    # discord 走代理',
      '    domain(geosite: discord) -> proxy',
      '}'
    ]
  }
];
export type Diag = {
  id: string;
  source: string;
  line: number;
  level: 'error' | 'warn' | 'info';
  msg: string;
  why: string;
  action: '拒絕' | '用預設' | '夾到邊界' | '照收';
};
export const diagnostics: Diag[] = [
  {
    id: 'd1',
    source: 'main',
    line: 43,
    level: 'error',
    msg: '出站 gaming2 不存在；可用的組：proxy、resilient、gaming',
    why: '猜錯會改變流量去向',
    action: '拒絕'
  },
  {id: 'd2', source: 'rules', line: 3, level: 'error', msg: 'ipversion(4) 之後多了一個 )', why: '結構不完整，整段規則會被丟掉', action: '拒絕'},
  {id: 'd3', source: 'main', line: 27, level: 'warn', msg: 'check_tolerance: 1m 超出範圍（最大 10s）', why: '只影響 URLTest 換節點的時序', action: '夾到邊界'},
  {id: 'd4', source: 'main', line: 24, level: 'warn', msg: 'sub-b 訂閱回應 HTTP 503，沿用 r33 的快取', why: '節點清單可能過時', action: '照收'},
  {id: 'd5', source: 'main', line: 3, level: 'info', msg: 'log_level 未設定時採用 info', why: '未表達意圖，用預設永遠正確', action: '用預設'},
  {id: 'd6', source: 'main', line: 21, level: 'info', msg: '訂閱 sub-a 有 3 個節點同名，已加上序號後綴', why: '不影響路由，只影響顯示', action: '照收'}
];
export const restartItems = ['global.tproxy_port', 'global.lan_interface', 'global.wan_interface'];
type Pending = {key: string; from: string; to: string; restart: boolean};
export const pending: Pending[] = [
  {key: 'global.log_level', from: 'info', to: 'debug', restart: false},
  {key: 'global.tproxy_port', from: '12345', to: '12346', restart: true},
  {key: 'routing', from: '11 條', to: '12 條', restart: false}
];

export const clashLog = [
  '[INFO] tcp 10.0.0.12:51422 -> api.telegram.org:443 match geosite(telegram) using proxy[hk-01]',
  '[INFO] udp 10.0.0.12:60001 -> 1.1.1.1:53 match l4proto(udp)&&dport(53) using direct',
  '[WARN] dns query discord.com HTTPS negative cached',
  '[INFO] tcp 10.0.0.31:44012 -> doubleclick.net:443 match geosite(ads) using block'
];
