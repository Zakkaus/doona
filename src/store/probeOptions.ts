import type {Capabilities, Group, ProbeRequest} from '../api/model';
import type {Key} from '../i18n';

const choices = [
  {id: 'http', label: 'probe.http', kind: 'http', transport: ['tcp']},
  {id: 'tcp_connect', label: 'probe.tcp', kind: 'tcp_connect', transport: ['tcp']},
  {id: 'dns_tcp', label: 'probe.dnsTcp', kind: 'dns', transport: ['tcp']},
  {id: 'dns_udp', label: 'probe.dnsUdp', kind: 'dns', transport: ['udp']},
  {id: 'dns_both', label: 'probe.dnsBoth', kind: 'dns', transport: ['tcp', 'udp']}
] satisfies Array<{id: string; label: Key; kind: ProbeRequest['kind']; transport: ProbeRequest['transport']}>;
export type ProbeChoice = (typeof choices)[number];
export type ProbeOptions = {choice: string; cold: boolean; leaves: boolean};

export function probeChoices(capabilities: Capabilities | undefined, type: ProbeRequest['target']['type'], group?: Group): ProbeChoice[] {
  const probes = capabilities?.resources.probes;
  if (!probes?.available || !probes.targets?.includes(type) || !probes.ip_versions?.length) return [];
  return choices.filter(
    choice =>
      probes.kinds?.includes(choice.kind) &&
      choice.transport.every(transport => probes.transports?.includes(transport) && (!group || group.capabilities.probe_transports.includes(transport)))
  );
}

export function optionsProbe(
  capabilities: Capabilities | undefined,
  target: ProbeRequest['target'],
  options: ProbeOptions,
  group?: Group
): ProbeRequest | null {
  const choice = probeChoices(capabilities, target.type, group).find(choice => choice.id === options.choice);
  if (!choice) return null;
  const versions = capabilities!.resources.probes.ip_versions!;
  const request: Omit<ProbeRequest, 'members'> & {members?: ProbeRequest['members']} = {
    target,
    kind: choice.kind,
    transport: [...choice.transport],
    ip_version: versions.includes('ipv4') ? (versions.includes('ipv6') ? 'any' : 'ipv4') : 'ipv6',
    warmth: options.cold ? 'cold' : 'warm',
    ...(target.type === 'group' ? {members: options.leaves ? 'leaves' : 'direct'} : {})
  };
  return request;
}
