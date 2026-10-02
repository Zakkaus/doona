import type {ProbeRequest} from '../api/model';

// honk e69390ed: probes/wire.rs:195 (server TCP), :227 (streams);
// honk-outbound/src/descriptor.rs:80-179 (UDP). null needs configuration absent from NodeRow (catalog.rs:136).
const protocols: Record<string, {connect: boolean; stream: boolean; udp: boolean | null}> = {
  ss: {connect: true, stream: true, udp: true},
  socks5: {connect: true, stream: true, udp: true},
  vmess: {connect: true, stream: true, udp: false},
  vless: {connect: true, stream: true, udp: null},
  trojan: {connect: true, stream: true, udp: null},
  anytls: {connect: true, stream: true, udp: null},
  hysteria2: {connect: false, stream: true, udp: true},
  tuic: {connect: false, stream: true, udp: true},
  juicity: {connect: false, stream: true, udp: true},
  direct: {connect: false, stream: true, udp: true},
  block: {connect: false, stream: false, udp: false}
};

export function nodeProbeSupport(protocol: string | null) {
  const key = protocol === 'shadowsocks' ? 'ss' : protocol;
  return (key && Object.hasOwn(protocols, key) ? protocols[key] : undefined) ?? {connect: false, stream: false, udp: false};
}

export function supportsNodeProbe(protocol: string | null, kind: ProbeRequest['kind'], transports: ProbeRequest['transport']): boolean {
  const support = nodeProbeSupport(protocol);
  return kind === 'tcp_connect'
    ? support.connect && transports.every(transport => transport === 'tcp')
    : support.stream && transports.every(transport => transport === 'tcp' || (kind === 'dns' && support.udp !== false));
}
