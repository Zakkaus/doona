import {describe, expect, it} from 'vitest';
import {advancedFields, emptyNode, manualFields, manualInvalid, manualLink, nodeLink, parseNodeLink, protocols, settle, type Protocol} from './nodeForm';

const uuid = 'b831381d-6324-4d53-ad4f-8cda48b30811';
const node = (protocol: Protocol, over: Record<string, string>) => ({...emptyNode(protocol), host: 'example.com', name: 'hk-01', ...over});

// The links honk's share-link parser reads: each row is a form state and the exact link it produces.
const links: [string, Protocol, Record<string, string>, string][] = [
  ['socks5', 'socks5', {port: '1080', username: 'user', password: 'pw'}, 'socks5://user:pw@example.com:1080#hk-01'],
  ['ss', 'ss', {port: '8388', method: 'aes-256-gcm', password: 'pw'}, 'ss://YWVzLTI1Ni1nY206cHc=@example.com:8388#hk-01'],
  ['trojan tcp', 'trojan', {password: 'pw', sni: 'example.com'}, 'trojan://pw@example.com:443?security=tls&type=tcp&sni=example.com#hk-01'],
  [
    'trojan ws',
    'trojan',
    {password: 'pw', type: 'ws', path: '/ws', transportHost: 'cdn.example.com'},
    'trojan://pw@example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com#hk-01'
  ],
  ['trojan grpc', 'trojan', {password: 'pw', type: 'grpc', serviceName: 'svc'}, 'trojan://pw@example.com:443?security=tls&type=grpc&serviceName=svc#hk-01'],
  [
    'trojan xhttp',
    'trojan',
    {password: 'pw', type: 'xhttp', path: '/x', transportHost: 'cdn.example.com', mode: 'packet-up'},
    'trojan://pw@example.com:443?security=tls&type=xhttp&path=%2Fx&host=cdn.example.com&mode=packet-up#hk-01'
  ],
  [
    'vless xhttp tls',
    'vless',
    {username: uuid, sni: 'example.com', type: 'xhttp', path: '/x', transportHost: 'cdn.example.com', mode: 'stream-up'},
    `vless://${uuid}@example.com:443?security=tls&type=xhttp&sni=example.com&path=%2Fx&host=cdn.example.com&mode=stream-up&encryption=none#hk-01`
  ],
  [
    'vless tls flow',
    'vless',
    {username: uuid, sni: 'example.com', flow: 'xtls-rprx-vision'},
    `vless://${uuid}@example.com:443?security=tls&type=tcp&sni=example.com&flow=xtls-rprx-vision&encryption=none#hk-01`
  ],
  ['vless none', 'vless', {username: uuid, security: 'none'}, `vless://${uuid}@example.com:443?security=none&type=tcp&encryption=none#hk-01`],
  [
    'vless reality ws',
    'vless',
    {username: uuid, security: 'reality', sni: 'front.example.com', pbk: 'AAAA', sid: 'ab12', type: 'ws', path: '/ws'},
    `vless://${uuid}@example.com:443?security=reality&type=ws&sni=front.example.com&pbk=AAAA&sid=ab12&path=%2Fws&encryption=none#hk-01`
  ],
  ['vmess auto', 'vmess', {username: uuid}, 'vmess://YXV0bzpiODMxMzgxZC02MzI0LTRkNTMtYWQ0Zi04Y2RhNDhiMzA4MTFAZXhhbXBsZS5jb206NDQz?type=tcp&scy=auto#hk-01'],
  [
    'vmess ws tls',
    'vmess',
    {username: uuid, security: 'tls', sni: 'example.com', type: 'ws', path: '/ws', transportHost: 'cdn.example.com'},
    'vmess://YXV0bzpiODMxMzgxZC02MzI0LTRkNTMtYWQ0Zi04Y2RhNDhiMzA4MTFAZXhhbXBsZS5jb206NDQz?security=tls&type=ws&sni=example.com&path=%2Fws&host=cdn.example.com&scy=auto#hk-01'
  ],
  [
    'vmess xhttp tls',
    'vmess',
    {username: uuid, security: 'tls', sni: 'example.com', type: 'xhttp', path: '/x', transportHost: 'cdn.example.com', mode: 'auto'},
    'vmess://YXV0bzpiODMxMzgxZC02MzI0LTRkNTMtYWQ0Zi04Y2RhNDhiMzA4MTFAZXhhbXBsZS5jb206NDQz?security=tls&type=xhttp&sni=example.com&path=%2Fx&host=cdn.example.com&mode=auto&scy=auto#hk-01'
  ],
  [
    'vmess grpc',
    'vmess',
    {username: uuid, type: 'grpc', serviceName: 'svc'},
    'vmess://YXV0bzpiODMxMzgxZC02MzI0LTRkNTMtYWQ0Zi04Y2RhNDhiMzA4MTFAZXhhbXBsZS5jb206NDQz?type=grpc&serviceName=svc&scy=auto#hk-01'
  ],
  [
    'vmess aes-128-gcm',
    'vmess',
    {username: uuid, method: 'aes-128-gcm'},
    'vmess://YjgzMTM4MWQtNjMyNC00ZDUzLWFkNGYtOGNkYTQ4YjMwODExQGV4YW1wbGUuY29tOjQ0Mw==?type=tcp&scy=aes-128-gcm#hk-01'
  ],
  ['hysteria2', 'hysteria2', {password: 'pw', sni: 'example.com'}, 'hysteria2://pw@example.com:443?sni=example.com#hk-01'],
  [
    'hysteria2 obfs',
    'hysteria2',
    {password: 'pw', obfs: 'salamander', 'obfs-password': 'op', insecure: '1'},
    'hysteria2://pw@example.com:443?obfs=salamander&obfs-password=op&insecure=1#hk-01'
  ],
  ['tuic', 'tuic', {username: uuid, password: 'pw', sni: 'example.com'}, `tuic://${uuid}:pw@example.com:443?sni=example.com#hk-01`],
  [
    'tuic bbr',
    'tuic',
    {username: uuid, password: 'pw', congestion_control: 'bbr', alpn: 'h3'},
    `tuic://${uuid}:pw@example.com:443?congestion_control=bbr&alpn=h3#hk-01`
  ],
  ['anytls', 'anytls', {password: 'pw', sni: 'example.com'}, 'anytls://pw@example.com:443?sni=example.com#hk-01'],
  ['juicity', 'juicity', {username: uuid, password: 'pw', sni: 'example.com'}, `juicity://${uuid}:pw@example.com:443?sni=example.com#hk-01`],
  [
    'ss plugin',
    'ss',
    {port: '8388', method: 'aes-256-gcm', password: 'pw', plugin: 'v2ray-plugin', 'plugin-opts': 'tls;host=cdn.example.com'},
    'ss://YWVzLTI1Ni1nY206cHc=@example.com:8388?plugin=v2ray-plugin&plugin-opts=tls%3Bhost%3Dcdn.example.com#hk-01'
  ],
  [
    'trojan pin and ech',
    'trojan',
    {password: 'pw', sni: 'example.com', pinSHA256: 'AAAA', ech_config: 'ZWNo'},
    'trojan://pw@example.com:443?security=tls&type=tcp&sni=example.com&pinSHA256=AAAA&ech_config=ZWNo#hk-01'
  ],
  ['trojan xhttp alpn', 'trojan', {password: 'pw', type: 'xhttp', alpn: 'h2'}, 'trojan://pw@example.com:443?security=tls&type=xhttp&alpn=h2#hk-01'],
  [
    'vless reality spx',
    'vless',
    {username: uuid, security: 'reality', flow: 'xtls-rprx-vision', sni: 'example.com', pbk: 'AAAA', sid: 'ab12', spx: '/x'},
    `vless://${uuid}@example.com:443?security=reality&type=tcp&flow=xtls-rprx-vision&sni=example.com&pbk=AAAA&sid=ab12&spx=%2Fx&encryption=none#hk-01`
  ],
  [
    'vless xray mux',
    'vless',
    {username: uuid, type: 'ws', packetEncoding: 'xudp', mux: 'xray', concurrency: '8', xudpConcurrency: '16', xudpProxyUDP443: 'skip'},
    `vless://${uuid}@example.com:443?security=tls&type=ws&packetEncoding=xudp&mux=xray&concurrency=8&xudpConcurrency=16&xudpProxyUDP443=skip&encryption=none#hk-01`
  ],
  [
    'vless h2mux padding',
    'vless',
    {username: uuid, type: 'grpc', serviceName: 'svc', mux: 'h2mux', padding: 'true'},
    `vless://${uuid}@example.com:443?security=tls&type=grpc&serviceName=svc&mux=h2mux&padding=true&encryption=none#hk-01`
  ],
  [
    'hysteria2 tuning',
    'hysteria2',
    {
      password: 'pw',
      sni: 'example.com',
      upmbps: '100',
      downmbps: '200',
      mport: '20000-20010',
      mhop: '30',
      mtu: '1400',
      initStreamReceiveWindow: '8388608',
      initConnReceiveWindow: '20971520',
      disablePathMTUDiscovery: '1'
    },
    'hysteria2://pw@example.com:443?sni=example.com&upmbps=100&downmbps=200&mport=20000-20010&mhop=30&mtu=1400&initStreamReceiveWindow=8388608&initConnReceiveWindow=20971520&disablePathMTUDiscovery=1#hk-01'
  ],
  ['tuic alpn and mtu', 'tuic', {username: uuid, password: 'pw', alpn: 'h3', mtu: '1300'}, `tuic://${uuid}:pw@example.com:443?alpn=h3&mtu=1300#hk-01`],
  [
    'anytls idle sessions',
    'anytls',
    {password: 'pw', min_idle_session: '5', idle_session_check_interval: '30', idle_session_timeout: '60'},
    'anytls://pw@example.com:443?min_idle_session=5&idle_session_check_interval=30&idle_session_timeout=60#hk-01'
  ],
  ['juicity mtu', 'juicity', {username: uuid, password: 'pw', mtu: '1350'}, `juicity://${uuid}:pw@example.com:443?mtu=1350#hk-01`]
];

describe('nodeLink', () => {
  it.each(links)('builds the %s link', (_, protocol, over, link) => {
    const fields = node(protocol, over);
    expect(nodeLink(fields)).toBe(link);
    expect(parseNodeLink(link).fields).toMatchObject({protocol, host: 'example.com', port: fields.port, name: 'hk-01'});
  });

  it('covers every protocol the form offers', () => {
    expect(new Set(links.map(row => row[1]))).toEqual(new Set(protocols));
  });

  it.each([
    ['auto', 'none'],
    ['auto', 'tls'],
    ['aes-128-gcm', 'none'],
    ['aes-128-gcm', 'tls']
  ])('keeps the VMess %s cipher in scy and names %s security only when it is TLS', (method, security) => {
    const link = nodeLink(node('vmess', {username: uuid, method, security}));
    const query = new URLSearchParams(link.split('?')[1].split('#')[0]);
    expect(query.get('scy')).toBe(method);
    expect(query.get('security')).toBe(security === 'tls' ? 'tls' : null);
    expect(atob(link.slice(8).split('?')[0])).toBe(`${method === 'auto' ? 'auto:' : ''}${uuid}@example.com:443`);
    expect(parseNodeLink(link).fields).toMatchObject({method, security, username: uuid});
  });
});

// The fields the standard form shows per protocol and choice, in order, after the server address and port.
const shown: [string, Protocol, Record<string, string>, string][] = [
  ['socks5', 'socks5', {}, 'username password'],
  ['ss', 'ss', {}, 'password method plugin'],
  ['trojan', 'trojan', {}, 'password security sni insecure type'],
  ['trojan ws', 'trojan', {type: 'ws'}, 'password security sni insecure type transportHost path'],
  ['trojan grpc', 'trojan', {type: 'grpc'}, 'password security sni insecure type serviceName'],
  ['trojan xhttp', 'trojan', {type: 'xhttp'}, 'password security sni insecure type transportHost path mode'],
  ['trojan reality', 'trojan', {security: 'reality'}, 'password security sni insecure pbk sid spx type'],
  ['vless', 'vless', {}, 'username security flow sni insecure type'],
  ['vless ws', 'vless', {type: 'ws', flow: 'xtls-rprx-vision'}, 'username security sni insecure type transportHost path'],
  ['vless grpc', 'vless', {type: 'grpc'}, 'username security sni insecure type serviceName'],
  ['vless xhttp', 'vless', {type: 'xhttp'}, 'username security sni insecure type transportHost path mode'],
  ['vless reality', 'vless', {security: 'reality'}, 'username security flow sni insecure pbk sid spx type'],
  ['vmess xhttp', 'vmess', {type: 'xhttp'}, 'username method security type transportHost path mode'],
  ['vless without security', 'vless', {security: 'none'}, 'username security type'],
  ['vmess', 'vmess', {}, 'username method security type'],
  ['vmess tls', 'vmess', {security: 'tls'}, 'username method security sni insecure type'],
  ['hysteria2', 'hysteria2', {}, 'password sni insecure obfs'],
  ['hysteria2 obfs', 'hysteria2', {obfs: 'salamander'}, 'password sni insecure obfs obfs-password'],
  ['tuic', 'tuic', {}, 'username password sni insecure congestion_control'],
  ['anytls', 'anytls', {}, 'password sni insecure'],
  ['juicity', 'juicity', {}, 'username password sni insecure']
];

describe('manualFields', () => {
  it.each(shown)('lists the %s fields', (_, protocol, over, keys) => {
    expect(manualFields(node(protocol, over)).map(field => field.key)).toEqual(keys.split(' '));
  });

  it('shows nothing honk ignores, and no protocol outside the form', () => {
    const keys = new Set(protocols.flatMap(protocol => manualFields(node(protocol, {})).map(field => field.key)));
    expect(keys).not.toContain('alpn');
    expect(keys).not.toContain('fp');
    expect(protocols).not.toContain('http');
  });
});

// The options behind the Advanced disclosure per protocol and choice, in order.
const advancedShown: [string, Protocol, Record<string, string>, string][] = [
  ['socks5', 'socks5', {}, ''],
  ['ss', 'ss', {}, ''],
  ['ss plugin', 'ss', {plugin: 'obfs-local'}, 'plugin-opts'],
  ['trojan', 'trojan', {}, 'pinSHA256 ech_config'],
  ['trojan xhttp', 'trojan', {type: 'xhttp'}, 'alpn pinSHA256 ech_config'],
  ['vmess without security', 'vmess', {security: 'none'}, ''],
  ['vmess xhttp without security', 'vmess', {security: 'none', type: 'xhttp'}, ''],
  ['vless', 'vless', {}, 'pinSHA256 ech_config packetEncoding mux'],
  ['vless h2mux', 'vless', {mux: 'h2mux'}, 'pinSHA256 ech_config packetEncoding mux padding'],
  ['vless xray', 'vless', {mux: 'xray'}, 'pinSHA256 ech_config packetEncoding mux concurrency xudpConcurrency xudpProxyUDP443'],
  ['vless vision', 'vless', {flow: 'xtls-rprx-vision', mux: 'xray'}, 'pinSHA256 ech_config packetEncoding'],
  [
    'vless ws flow',
    'vless',
    {type: 'ws', flow: 'xtls-rprx-vision', mux: 'xray'},
    'pinSHA256 ech_config packetEncoding mux concurrency xudpConcurrency xudpProxyUDP443'
  ],
  ['hysteria2', 'hysteria2', {}, 'pinSHA256 ech_config upmbps downmbps mport mhop mtu initStreamReceiveWindow initConnReceiveWindow disablePathMTUDiscovery'],
  ['tuic', 'tuic', {}, 'alpn pinSHA256 ech_config mtu initStreamReceiveWindow initConnReceiveWindow'],
  ['anytls', 'anytls', {}, 'pinSHA256 ech_config min_idle_session idle_session_check_interval idle_session_timeout'],
  ['juicity', 'juicity', {}, 'pinSHA256 ech_config mtu']
];

describe('advancedFields', () => {
  it.each(advancedShown)('lists the %s options', (_, protocol, over, keys) => {
    expect(advancedFields(node(protocol, over)).map(field => field.key)).toEqual(keys ? keys.split(' ') : []);
  });

  it.each([
    ['tcp', 'tls', true],
    ['tcp', 'reality', true],
    ['tcp', 'none', false],
    ['ws', 'tls', false],
    ['grpc', 'reality', false],
    ['xhttp', 'tls', false]
  ])('offers the VLESS flow over %s with %s only where honk accepts it: %s', (type, security, offered) => {
    expect(manualFields(node('vless', {type, security})).some(field => field.key === 'flow')).toBe(offered);
  });

  it('offers flow to no other protocol', () => {
    expect(['vmess', 'trojan', 'tuic'].some(protocol => manualFields(node(protocol as Protocol, {})).some(field => field.key === 'flow'))).toBe(false);
  });

  it.each([
    ['tuic', {}, true],
    ['trojan', {type: 'xhttp'}, true],
    ['vmess', {type: 'xhttp', security: 'none'}, false],
    ['vless', {type: 'ws'}, false],
    ['hysteria2', {}, false],
    ['anytls', {}, false]
  ] as [Protocol, Record<string, string>, boolean][])('offers ALPN to %s %j only where honk reads it: %s', (protocol, over, offered) => {
    expect(advancedFields(node(protocol, over)).some(field => field.key === 'alpn')).toBe(offered);
  });
});

describe('settle', () => {
  it.each([
    ['flow leaves with the TCP transport', {flow: 'xtls-rprx-vision', type: 'ws'}, {flow: ''}],
    ['flow leaves with the security', {flow: 'xtls-rprx-vision', security: 'none'}, {flow: ''}],
    ['flow stays over TCP with TLS', {flow: 'xtls-rprx-vision'}, {flow: 'xtls-rprx-vision'}],
    [
      'flow ends mux and the UDP encodings it cannot carry',
      {flow: 'xtls-rprx-vision', mux: 'xray', concurrency: '4', packetEncoding: 'uot-v2'},
      {mux: '', concurrency: '', packetEncoding: ''}
    ],
    ['flow keeps xudp', {flow: 'xtls-rprx-vision', packetEncoding: 'xudp'}, {packetEncoding: 'xudp'}]
  ])('%s', (_, over, expected) => {
    expect(settle(node('vless', over))).toMatchObject(expected);
  });
});

describe('manualInvalid and manualLink', () => {
  it('names the missing or malformed fields', () => {
    expect(manualInvalid({...emptyNode('vless'), host: '', port: '70000', username: 'x'})).toEqual(['host', 'port', 'username']);
    expect(manualInvalid(node('trojan', {}))).toEqual(['password']);
    expect(manualInvalid(node('socks5', {}))).toEqual([]);
  });

  it.each([
    ['REALITY needs its public key', 'vless', {username: uuid, security: 'reality'}, ['pbk']],
    ['REALITY needs its public key on Trojan', 'trojan', {password: 'pw', security: 'reality', pbk: ''}, ['pbk']],
    ['REALITY with its key', 'trojan', {password: 'pw', security: 'reality', pbk: 'AAAA'}, []],
    ['MTU below the range honk reads', 'tuic', {username: uuid, password: 'pw', mtu: '1000'}, ['mtu']],
    ['MTU in range', 'juicity', {username: uuid, password: 'pw', mtu: '1400'}, []],
    ['a word for a number', 'hysteria2', {password: 'pw', upmbps: 'fast'}, ['upmbps']],
    ['a negative bandwidth', 'hysteria2', {password: 'pw', downmbps: '-5'}, ['downmbps']],
    ['hop ports that repeat', 'hysteria2', {password: 'pw', mport: '2000-2010,2005'}, ['mport']],
    ['hop ports that start at zero', 'hysteria2', {password: 'pw', mport: '0-10'}, ['mport']],
    ['hop ports in ranges', 'hysteria2', {password: 'pw', mport: '20000-20010, 30000'}, []],
    ['XHTTP with H2 and another ALPN', 'vless', {username: uuid, type: 'xhttp', alpn: 'h2,http/1.1'}, ['alpn']],
    ['XHTTP with H2 alone', 'vless', {username: uuid, type: 'xhttp', alpn: 'h2'}, []],
    ['TUIC with h3', 'tuic', {username: uuid, password: 'pw', alpn: 'h3,h2'}, []],
    ['XHTTP behind Xray mux with a TCP pool', 'vless', {username: uuid, type: 'xhttp', mux: 'xray', concurrency: '8'}, ['concurrency']],
    ['XHTTP behind Xray mux with no TCP pool', 'vless', {username: uuid, type: 'xhttp', mux: 'xray', concurrency: '-1'}, []],
    ['XHTTP behind Xray mux with the default pool', 'vless', {username: uuid, type: 'xhttp', mux: 'xray'}, ['concurrency']],
    ['Xray mux over WebSocket with the default pool', 'vless', {username: uuid, type: 'ws', mux: 'xray'}, []]
  ] as [string, Protocol, Record<string, string>, string[]][])('flags %s', (_, protocol, over, keys) => {
    expect(manualInvalid(node(protocol, over))).toEqual(keys);
  });

  it('gives no link until the fields are valid', () => {
    expect(manualLink(node('trojan', {}))).toBe('');
    expect(manualLink(node('trojan', {password: 'pw', sni: 'example.com'}))).toBe('trojan://pw@example.com:443?security=tls&type=tcp&sni=example.com#hk-01');
  });

  it('leaves out a field the form hides, however it was filled before', () => {
    const filled = {password: 'pw', type: 'tcp', path: '/ws', serviceName: 'svc', pbk: 'AAAA', obfs: 'salamander'};
    expect(manualLink(node('trojan', filled))).toBe('trojan://pw@example.com:443?security=tls&type=tcp#hk-01');
    expect(manualLink(node('trojan', {...filled, type: 'grpc'}))).toBe('trojan://pw@example.com:443?security=tls&type=grpc&serviceName=svc#hk-01');
  });
});
