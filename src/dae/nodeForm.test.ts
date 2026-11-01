import {describe, expect, it} from 'vitest';
import {manualFields, manualInvalid, manualLink, emptyNode, nodeLink, parseNodeLink, protocols, type Protocol} from './nodeForm';

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
  ['juicity', 'juicity', {username: uuid, password: 'pw', sni: 'example.com'}, `juicity://${uuid}:pw@example.com:443?sni=example.com#hk-01`]
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
  ['ss', 'ss', {}, 'password method'],
  ['trojan', 'trojan', {}, 'password security sni insecure type'],
  ['trojan ws', 'trojan', {type: 'ws'}, 'password security sni insecure type transportHost path'],
  ['trojan grpc', 'trojan', {type: 'grpc'}, 'password security sni insecure type serviceName'],
  ['trojan reality', 'trojan', {security: 'reality'}, 'password security sni insecure pbk sid type'],
  ['vless', 'vless', {}, 'username security flow sni insecure type'],
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

describe('manualInvalid and manualLink', () => {
  it('names the missing or malformed fields', () => {
    expect(manualInvalid({...emptyNode('vless'), host: '', port: '70000', username: 'x'})).toEqual(['host', 'port', 'username']);
    expect(manualInvalid(node('trojan', {}))).toEqual(['password']);
    expect(manualInvalid(node('socks5', {}))).toEqual([]);
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
