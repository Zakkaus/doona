import {expect, it, vi} from 'vitest';
import type {Capabilities, Group, ProbeRequest} from '../api/model';
import {latencyProbeChoice, optionsProbe, probeChoices, probeDefaults, readProbeOptions, saveProbeOptions, type ProbeOptions} from './probeOptions';
import {storageKeys} from '../api/storage';

const caps = {
  resources: {
    probes: {
      available: true,
      targets: ['node', 'group'],
      kinds: ['http', 'tcp_connect', 'dns'],
      transports: ['tcp', 'udp'],
      ip_versions: ['ipv4', 'ipv6']
    }
  }
} as Capabilities;
const pick = (options: Partial<ProbeOptions> = {}): ProbeOptions => ({...probeDefaults, ...options});
const memory = (saved: string | null) => {
  const items = new Map<string, string>(saved === null ? [] : [[storageKeys.latencyProbe, saved]]);
  return {getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: () => {}};
};

it.each([
  {saved: null, expected: probeDefaults},
  {saved: 'tcp_connect', expected: pick({choice: 'tcp_connect'})},
  {saved: 'null', expected: probeDefaults},
  {saved: '{"choice":"dns_udp","family":"ipv6","cold":true,"leaves":true}', expected: {choice: 'dns_udp', family: 'ipv6', cold: true, leaves: true}},
  {saved: '{"choice":3,"family":"any","cold":"yes"}', expected: probeDefaults}
])('reads the saved probe options $saved', ({saved, expected}) => {
  expect(readProbeOptions(memory(saved))).toEqual(expected);
});

it('saves a change over the saved options and reads it back', () => {
  const storage = memory('dns_tcp');
  vi.stubGlobal('localStorage', storage);
  try {
    saveProbeOptions({cold: true}, storage);
    expect(readProbeOptions(storage)).toEqual(pick({choice: 'dns_tcp', cold: true}));
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([
  {family: 'auto', versions: ['ipv4', 'ipv6'], expected: 'any'},
  {family: 'auto', versions: ['ipv6'], expected: 'ipv6'},
  {family: 'ipv4', versions: ['ipv4', 'ipv6'], expected: 'ipv4'},
  {family: 'ipv6', versions: ['ipv4', 'ipv6'], expected: 'ipv6'},
  {family: 'ipv6', versions: ['ipv4'], expected: 'ipv4'}
] as const)('sends the $family family over advertised $versions', ({family, versions, expected}) => {
  const capabilities = {resources: {probes: {...caps.resources.probes, ip_versions: [...versions]}}} as Capabilities;
  expect(optionsProbe(capabilities, {type: 'node', node_id: 'n'}, pick({family}))?.ip_version).toBe(expected);
});

it.each([
  ['http', 'http', ['tcp']],
  ['tcp_connect', 'tcp_connect', ['tcp']],
  ['dns_tcp', 'dns', ['tcp']],
  ['dns_udp', 'dns', ['udp']],
  ['dns_both', 'dns', ['tcp', 'udp']]
] as const)('maps %s to contract kind and transports', (choice, kind, transport) => {
  for (const cold of [false, true]) {
    for (const leaves of [false, true]) {
      for (const target of [
        {type: 'node', node_id: 'n'},
        {type: 'group', group_id: 'g'}
      ] satisfies ProbeRequest['target'][]) {
        expect(optionsProbe(caps, target, pick({choice, cold, leaves}))).toEqual({
          target,
          kind,
          transport: [...transport],
          warmth: cold ? 'cold' : 'warm',
          ip_version: 'any',
          ...(target.type === 'group' ? {members: leaves ? 'leaves' : 'direct'} : {})
        });
      }
    }
  }
});

it.each([{available: false}, {targets: ['group']}, {kinds: []}, {transports: []}, {ip_versions: []}])(
  'sends no probe the backend does not advertise: %j',
  overrides => {
    const capabilities = {resources: {probes: {...caps.resources.probes, ...overrides}}} as Capabilities;
    expect(optionsProbe(capabilities, {type: 'node', node_id: 'n'}, pick({choice: 'dns_udp', cold: true}))).toBeNull();
  }
);

it('offers only transports the group supports and replaces stale choices', () => {
  const group = {capabilities: {probe_transports: ['udp']}} as Group;
  expect(probeChoices(caps, 'group', group).map(choice => choice.id)).toEqual(['dns_udp']);
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, pick(), group)).toMatchObject({kind: 'dns', transport: ['udp']});
  expect(probeChoices(undefined, 'node')).toEqual([]);
  expect(optionsProbe(caps, {type: 'node', node_id: 'n'}, pick({choice: 'missing'}))?.kind).toBe('http');
});

it.each([
  {chosen: 'tcp_connect', kinds: ['http', 'tcp_connect', 'dns'], expected: 'tcp_connect', transport: ['tcp']},
  {chosen: 'dns_udp', kinds: ['http', 'tcp_connect', 'dns'], expected: 'dns', transport: ['udp']},
  {chosen: 'dns_both', kinds: ['http', 'tcp_connect', 'dns'], expected: 'dns', transport: ['tcp', 'udp']},
  {chosen: 'dns_udp', kinds: ['http', 'tcp_connect'], expected: 'http', transport: ['tcp']},
  {chosen: 'http', kinds: ['tcp_connect'], expected: 'tcp_connect', transport: ['tcp']},
  {chosen: undefined, kinds: ['http', 'tcp_connect', 'dns'], expected: 'http', transport: ['tcp']},
  {chosen: undefined, kinds: ['tcp_connect'], expected: 'tcp_connect', transport: ['tcp']}
] as const)('resolves latency preference $chosen against offered kinds $kinds', ({chosen, kinds, expected, transport}) => {
  const capabilities = {resources: {probes: {...caps.resources.probes, kinds: [...kinds]}}} as Capabilities;
  for (const target of [
    {type: 'node', node_id: 'n'},
    {type: 'group', group_id: 'g'}
  ] satisfies ProbeRequest['target'][]) {
    expect(optionsProbe(capabilities, target, chosen ? pick({choice: chosen}) : undefined)).toEqual({
      target,
      kind: expected,
      transport: [...transport],
      warmth: 'warm',
      ip_version: 'any',
      ...(target.type === 'group' ? {members: 'direct'} : {})
    });
  }
});

it('falls back when the chosen transport is no longer offered', () => {
  const capabilities = {resources: {probes: {...caps.resources.probes, transports: ['tcp']}}} as Capabilities;
  expect(optionsProbe(capabilities, {type: 'node', node_id: 'n'}, pick({choice: 'dns_udp'}))?.kind).toBe('http');
  const group = {capabilities: {probe_transports: ['tcp']}} as Group;
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, pick({choice: 'dns_udp'}), group)?.kind).toBe('http');
});

it.each([
  ['hysteria2', 'tcp_connect', 'http'],
  ['tuic', 'http', 'http'],
  ['juicity', 'dns_udp', 'dns_udp'],
  ['vmess', 'dns_udp', 'http'],
  ['vless', 'dns_both', 'http'],
  ['trojan', 'dns_udp', 'http'],
  ['anytls', 'dns_udp', 'http'],
  ['ss', 'tcp_connect', 'tcp_connect'],
  ['direct', 'tcp_connect', 'http'],
  ['block', 'http', undefined],
  [null, 'http', undefined]
] as const)('chooses %s probes from the node paths (%s)', (protocol, chosen, expected) => {
  const available = probeChoices(caps, 'node', undefined, [protocol]);
  expect(latencyProbeChoice(available, chosen)?.id).toBe(expected);
  const request = optionsProbe(caps, {type: 'node', node_id: 'n'}, pick({choice: chosen}), undefined, [protocol]);
  expect(
    request ? probeChoices(caps, 'node').find(choice => choice.kind === request.kind && choice.transport.join() === request.transport.join())?.id : undefined
  ).toBe(expected);
});

it('uses one common group kind and respects UDP-only groups', () => {
  const group = {capabilities: {probe_transports: ['tcp', 'udp']}} as Group;
  const protocols = ['hysteria2', 'vmess', 'trojan'];
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, pick({choice: 'tcp_connect'}), group, protocols)?.kind).toBe('http');
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, pick({choice: 'dns_udp'}), group, protocols)?.transport).toEqual(['tcp']);
  group.capabilities.probe_transports = ['udp'];
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, pick(), group, ['hysteria2'])?.kind).toBe('dns');
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, pick(), group, protocols)).toBeNull();
});
