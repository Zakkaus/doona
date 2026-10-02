import {expect, it} from 'vitest';
import {supportsNodeProbe} from './probes';

it.each([
  ['ss', true, true, true],
  ['shadowsocks', true, true, true],
  ['socks5', true, true, true],
  ['vmess', true, true, false],
  ['vless', true, true, true],
  ['trojan', true, true, true],
  ['anytls', true, true, true],
  ['hysteria2', false, true, true],
  ['tuic', false, true, true],
  ['juicity', false, true, true],
  ['direct', false, true, true],
  ['block', false, false, false],
  ['unknown', false, false, false],
  [null, false, false, false]
] as const)('derives probe paths for %s', (protocol, connect, stream, udp) => {
  expect(supportsNodeProbe(protocol, 'tcp_connect', ['tcp'])).toBe(connect);
  expect(supportsNodeProbe(protocol, 'http', ['tcp'])).toBe(stream);
  expect(supportsNodeProbe(protocol, 'dns', ['tcp'])).toBe(stream);
  expect(supportsNodeProbe(protocol, 'dns', ['udp'])).toBe(udp);
  expect(supportsNodeProbe(protocol, 'dns', ['tcp', 'udp'])).toBe(stream && udp);
  expect(supportsNodeProbe(protocol, 'http', ['udp'])).toBe(false);
});
