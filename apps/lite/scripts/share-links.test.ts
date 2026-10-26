import {describe, expect, it} from 'vitest';
import {emptyNode, nodeLink, parseNodeLink, protocols} from '../src/nodeForm';
const uuid = 'b831381d-6324-4d53-ad4f-8cda48b30811';
const b64 = (s: string) => Buffer.from(s).toString('base64url');
// Accepted vectors from honk-config/tests/share_link.rs at 40b11281b, plus edit invariants.
const vectors = [
  `ss://${b64('aes-128-gcm:password')}@example.com:8388#test`,
  'ss://aes-128-gcm:password@example.com:8388',
  `ss://${b64('aes-128-gcm:p@ss:word@example.com:8388')}`,
  `ss://${b64('aes-128-gcm:password@[2001:db8::1]:8388')}#IPv6`,
  `ss://${b64('aes-128-gcm:password')}@example.com:8388/?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Dexample.com`,
  `vmess://${b64(JSON.stringify({v: '2', ps: 'VMess', add: 'example.com', port: '443', id: uuid, aid: '0', scy: 'auto', net: 'ws', host: 'cdn.example.com', path: '/ws', tls: 'tls', sni: 'front.example.com'}))}`,
  `vmess://${b64(`auto:${uuid}@example.com:443`)}?tls=1&obfs=websocket&obfsParam=cdn.example.com&path=%2Fws`,
  `vless://${uuid}@example.com:443?encryption=none&security=reality&pbk=public-key&sid=0123456789abcdef&spx=%2F&flow=xtls-rprx-vision`,
  `vless://${b64(`${uuid}@example.com:443`)}?tls=1&peer=front.example.com`,
  `vless://${uuid}@[2001:db8::1]:443?type=grpc&serviceName=example&security=tls`,
  `vless://${uuid}@example.com:443?packetEncoding=xudp&mux=xray&concurrency=8&xudpConcurrency=4`,
  `vless://${uuid}@example.com:443?type=xhttp&mode=packet-up&path=%2Fupload&extra=%7B%22scMaxEachPostBytes%22%3A1000000%7D`,
  'trojan://password@example.com:443?sni=front.example.com&type=ws&host=cdn.example.com&path=%2Fws',
  'trojan://p%40ss%3Aword@example.com:443?allowInsecure=1#%E6%B8%AC%E8%A9%A6',
  'anytls://secret@example.com:443?sni=front.example.com&idle_session_check_interval=30s&idle_session_timeout=60s&min_idle_session=4',
  'hysteria2://user:pass@example.com:443?obfs=salamander&obfs-password=secret&sni=front.example.com',
  'hy2://secret@example.com:443?mport=443,5000-6000&mhop=30&upmbps=100&downmbps=200',
  'hysteria2://secret@example.com:443,5000-6000?insecure=1',
  `tuic://${uuid}:secret@[2001:db8::1]:443?congestion_control=bbr&alpn=h3&initStreamReceiveWindow=1048576&mtu=1400`,
  `juicity://${uuid}:secret@example.com:443?sni=front.example.com&insecure=1&mtu=1400`,
  'socks5://user:p%40ss@example.com:1080#SOCKS5',
  'socks5://example.com:1080',
  'socks5://user:pass@example.com:1080 -> trojan://password@example.com:443'
];
describe.each(vectors)('share link %s', link => {
  it('round trips untouched bytes', () => {
    const {document, fields} = parseNodeLink(link);
    expect(nodeLink(fields, document)).toBe(link);
  });
  it('edits the server without losing the protocol or credentials', () => {
    const {document, fields} = parseNodeLink(link);
    const changed = nodeLink({...fields, host: 'new.example.com'}, document);
    const again = parseNodeLink(changed).fields;
    expect(again.host).toBe('new.example.com');
    expect(again.protocol).toBe(fields.protocol);
    expect(again.username).toBe(fields.username);
    expect(again.password).toBe(fields.password);
  });
});
it.each(protocols)('creates a %s link from fields', protocol => {
  const fields = {...emptyNode(protocol), host: 'example.com', username: uuid, password: protocol === 'vmess' || protocol === 'vless' ? '' : 'secret'};
  const parsed = parseNodeLink(nodeLink(fields)).fields;
  expect(parsed.host).toBe(fields.host);
  expect(parsed.protocol).toBe(protocol);
});
it('preserves unknown query parameters and synchronizes aliases on edit', () => {
  const {document, fields} = parseNodeLink(`vless://${uuid}@example.com:443?sni=old&peer=old&future=opaque&insecure=1`);
  const link = nodeLink({...fields, sni: 'new'}, document);
  expect(link).toContain('future=opaque');
  expect(link).toContain('insecure=1');
  expect(link).toContain('sni=new');
  expect(link).not.toContain('peer=old');
});
it.each(['ssr', 'http', 'https', 'trojan-go'])('rejects unsupported %s', protocol => expect(() => parseNodeLink(`${protocol}://example.com:443`)).toThrow());

import honkVectors from './honk-share-vectors.json';
it.each(honkVectors)('preserves the accepted honk vector at line $line', ({link}) => {
  const {document, fields} = parseNodeLink(link);
  expect(nodeLink(fields, document)).toBe(link);
});
it.each(['a%20b', 'a/b', 'p#x', 'a:b', 'a@b'])('keeps literal SS legacy password %s on edit', password => {
  const {document, fields} = parseNodeLink(`ss://${b64(`aes-256-gcm:${password}@1.2.3.4:8388`)}`);
  expect(fields.password).toBe(password);
  expect(parseNodeLink(nodeLink({...fields, host: 'new.example.com'}, document)).fields.password).toBe(password);
});
it('preserves VMess Shadowrocket options when editing the host', () => {
  const link = `vmess://${b64(`auto:${uuid}@example.com:443`)}?tls=1&obfs=websocket&obfsParam=cdn.example.com&future=opaque`;
  const {document, fields} = parseNodeLink(link);
  expect(fields.type).toBe('ws');
  expect(fields.transportHost).toBe('cdn.example.com');
  const result = nodeLink({...fields, host: 'new.example.com'}, document);
  expect(result).toContain('future=opaque');
  expect(parseNodeLink(result).fields.type).toBe('ws');
});
it('preserves JSON fields on an unrelated edit', () => {
  const link = `vmess://${b64(JSON.stringify({add: 'example.com', port: 443, id: uuid, net: 'grpc', path: 'service', future: {opaque: true}}))}`;
  const {document, fields} = parseNodeLink(link);
  const result = parseNodeLink(nodeLink({...fields, host: 'new.example.com'}, document));
  expect(result.fields.serviceName).toBe('service');
  expect(result.document.json?.future).toEqual({opaque: true});
});

it.each(honkVectors)('edits the host without dropping credentials in honk vector at line $line', ({link}) => {
  const {document, fields} = parseNodeLink(link);
  const again = parseNodeLink(nodeLink({...fields, host: 'new.example.com'}, document)).fields;
  expect(again.host).toBe('new.example.com');
  expect(again.username).toBe(fields.username);
  expect(again.password).toBe(fields.password);
  expect(again.type).toBe(fields.type);
});

it.each(['true', 'yes', '1', 'on', 'TRUE'])('fills the TLS checkbox for insecure=%s', spelling =>
  expect(parseNodeLink(`trojan://pw@example.com:443?insecure=${spelling}`).fields.insecure).toBe('1')
);
it.each([
  ['tls=1', 'tls'],
  ['tls=0', 'none'],
  ['security=none', 'none'],
  ['security=reality&pbk=AAA', 'reality']
])('fills canonical VLESS security for %s', (query, expected) =>
  expect(parseNodeLink(`vless://${uuid}@example.com:443?${query}`).fields.security).toBe(expected)
);
it('keeps the VMess cipher separate from TLS', () => {
  const parsed = parseNodeLink(`vmess://${b64(`auto:${uuid}@example.com:443`)}?tls=1&security=aes-128-gcm`);
  expect(parsed.fields.security).toBe('tls');
  expect(parsed.fields.method).toBe('aes-128-gcm');
  expect(nodeLink(parsed.fields, parsed.document)).toBe(parsed.document.original);
});
it('changes plugin options without resurrecting embedded original options', () => {
  const parsed = parseNodeLink(`ss://${b64('aes-256-gcm:pw')}@example.com:443?plugin=v2ray-plugin%3Btls`);
  const updated = nodeLink({...parsed.fields, 'plugin-opts': ''}, parsed.document);
  expect(parseNodeLink(updated).fields['plugin-opts'] ?? '').toBe('');
});

it('unknown query keys cannot replace the URI protocol, address or credentials', () => {
  const parsed = parseNodeLink('trojan://secret@example.com:443?protocol=ss&port=123&username=other&password=other&name=other');
  expect(parsed.fields.protocol).toBe('trojan');
  expect(parsed.fields.port).toBe('443');
  expect(parsed.fields.password).toBe('secret');
  expect(parsed.fields.name).toBe('');
  const edited = parseNodeLink(nodeLink({...parsed.fields, host: 'next.example.com'}, parsed.document));
  expect(edited.fields.protocol).toBe('trojan');
  expect(edited.fields.password).toBe('secret');
});
it('fills Shadowrocket VLESS flow and grpc service fields', () => {
  const parsed = parseNodeLink(`vless://${b64(`auto:${uuid}@example.com:443`)}?tls=1&xtls=2&obfs=grpc&path=service`);
  expect(parsed.fields.flow).toBe('xtls-rprx-vision');
  expect(parsed.fields.serviceName).toBe('service');
});

it('editing the VMess cipher removes a conflicting security cipher alias', () => {
  const parsed = parseNodeLink(`vmess://${b64(`auto:${uuid}@example.com:443`)}?security=auto&tls=1`);
  const link = nodeLink({...parsed.fields, method: 'aes-128-gcm'}, parsed.document);
  expect(link).not.toContain('security=auto');
  expect(parseNodeLink(link).fields.method).toBe('aes-128-gcm');
  expect(parseNodeLink(link).fields.security).toBe('tls');
});
it('disabling Vision removes the Shadowrocket xtls alias', () => {
  const parsed = parseNodeLink(`vless://${b64(`auto:${uuid}@example.com:443`)}?tls=1&xtls=2`);
  const link = nodeLink({...parsed.fields, flow: ''}, parsed.document);
  expect(link).not.toContain('xtls=2');
  expect(parseNodeLink(link).fields.flow ?? '').toBe('');
});
