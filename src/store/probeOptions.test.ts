import {expect, it} from 'vitest';
import type {Capabilities, Group, ProbeRequest} from '../api/model';
import {optionsProbe, probeChoices} from './probeOptions';

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
        expect(optionsProbe(caps, target, {choice, cold, leaves})).toEqual({
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

it.each([{available: false}, {targets: ['group']}, {kinds: ['http']}, {transports: ['tcp']}, {ip_versions: []}])(
  'rejects options not advertised by the backend: %j',
  overrides => {
    const capabilities = {resources: {probes: {...caps.resources.probes, ...overrides}}} as Capabilities;
    expect(optionsProbe(capabilities, {type: 'node', node_id: 'n'}, {choice: 'dns_udp', cold: true, leaves: false})).toBeNull();
  }
);

it.each(['ipv4', 'ipv6'] as const)('uses only the advertised %s family', version => {
  const capabilities = {resources: {probes: {...caps.resources.probes, ip_versions: [version]}}} as Capabilities;
  expect(optionsProbe(capabilities, {type: 'node', node_id: 'n'}, {choice: 'http', cold: false, leaves: false})?.ip_version).toBe(version);
});

it('offers only transports the group supports and rejects stale choices', () => {
  const group = {capabilities: {probe_transports: ['udp']}} as Group;
  expect(probeChoices(caps, 'group', group).map(choice => choice.id)).toEqual(['dns_udp']);
  expect(optionsProbe(caps, {type: 'group', group_id: 'g'}, {choice: 'http', cold: false, leaves: false}, group)).toBeNull();
  expect(probeChoices(undefined, 'node')).toEqual([]);
  expect(optionsProbe(caps, {type: 'node', node_id: 'n'}, {choice: 'missing', cold: false, leaves: false})).toBeNull();
});
