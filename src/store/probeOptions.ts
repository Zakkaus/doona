import {useSyncExternalStore} from 'react';
import type {Capabilities, Group, ProbeRequest} from '../api/model';
import type {StoragePort} from '../api/profiles';
import {storageKeys} from '../api/storage';
import {supportsNodeProbe} from '../dae/probes';
import type {Key} from '../i18n';

const choices = [
  {id: 'http', label: 'probe.http', kind: 'http', transport: ['tcp']},
  {id: 'tcp_connect', label: 'probe.tcp', kind: 'tcp_connect', transport: ['tcp']},
  {id: 'dns_tcp', label: 'probe.dnsTcp', kind: 'dns', transport: ['tcp']},
  {id: 'dns_udp', label: 'probe.dnsUdp', kind: 'dns', transport: ['udp']},
  {id: 'dns_both', label: 'probe.dnsBoth', kind: 'dns', transport: ['tcp', 'udp']}
] satisfies Array<{id: string; label: Key; kind: ProbeRequest['kind']; transport: ProbeRequest['transport']}>;
export type ProbeChoice = (typeof choices)[number];

export function latencyProbeChoice(available: ProbeChoice[], chosen?: string | null): ProbeChoice | null {
  return available.find(choice => choice.id === chosen) ?? available.find(choice => choice.id === 'http') ?? available[0] ?? null;
}

export type ProbeFamily = 'auto' | 'ipv4' | 'ipv6';
export type ProbeOptions = {choice: string; family: ProbeFamily; cold: boolean; leaves: boolean};
export const probeDefaults: ProbeOptions = {choice: 'http', family: 'auto', cold: false, leaves: false};

// Saved in this browser. A value saved before the other options is the bare choice id.
export function readProbeOptions(storage?: StoragePort): ProbeOptions {
  let saved: string | null = null;
  try {
    saved = (storage ?? localStorage).getItem(storageKeys.latencyProbe);
  } catch {}
  if (!saved) return probeDefaults;
  let value: Partial<Record<keyof ProbeOptions, unknown>> | null;
  try {
    value = JSON.parse(saved) as Partial<Record<keyof ProbeOptions, unknown>> | null;
  } catch {
    return {...probeDefaults, choice: saved};
  }
  return {
    choice: typeof value?.choice === 'string' ? value.choice : probeDefaults.choice,
    family: value?.family === 'ipv4' || value?.family === 'ipv6' ? value.family : 'auto',
    cold: value?.cold === true,
    leaves: value?.leaves === true
  };
}
let current: ProbeOptions | undefined;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= readProbeOptions());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function saveProbeOptions(patch: Partial<ProbeOptions>, storage?: StoragePort) {
  current = {...snapshot(), ...patch};
  try {
    (storage ?? localStorage).setItem(storageKeys.latencyProbe, JSON.stringify(current));
  } catch {}
  listeners.forEach(listener => listener());
}
export const useProbeOptions = () => useSyncExternalStore(subscribe, snapshot);

export function probeChoices(
  capabilities: Capabilities | undefined,
  type: ProbeRequest['target']['type'],
  group?: Group,
  protocols?: Array<string | null>
): ProbeChoice[] {
  const probes = capabilities?.resources.probes;
  if (!probes?.available || !probes.targets?.includes(type) || !probes.ip_versions?.length) return [];
  return choices.filter(
    choice =>
      probes.kinds?.includes(choice.kind) &&
      (!protocols || protocols.every(protocol => supportsNodeProbe(protocol, choice.kind, choice.transport))) &&
      choice.transport.every(transport => probes.transports?.includes(transport) && (!group || group.capabilities.probe_transports.includes(transport)))
  );
}

export function optionsProbe(
  capabilities: Capabilities | undefined,
  target: ProbeRequest['target'],
  options: ProbeOptions = probeDefaults,
  group?: Group,
  protocols?: Array<string | null>
): ProbeRequest | null {
  // A choice the target cannot carry falls back to HTTP, then to the first it can; probeFallback reports the swap.
  const choice = latencyProbeChoice(probeChoices(capabilities, target.type, group, protocols), options.choice);
  if (!choice) return null;
  const versions = capabilities!.resources.probes.ip_versions!;
  const auto = versions.includes('ipv4') ? (versions.includes('ipv6') ? 'any' : 'ipv4') : 'ipv6';
  const request: Omit<ProbeRequest, 'members'> & {members?: ProbeRequest['members']} = {
    target,
    kind: choice.kind,
    transport: [...choice.transport],
    ip_version: options.family !== 'auto' && versions.includes(options.family) ? options.family : auto,
    warmth: options.cold ? 'cold' : 'warm',
    ...(target.type === 'group' ? {members: options.leaves ? 'leaves' : 'direct'} : {})
  };
  return request;
}

export function probeFallback(chosen: string | null | undefined, request: ProbeRequest) {
  const from = choices.find(choice => choice.id === chosen);
  const to = choices.find(choice => choice.kind === request.kind && choice.transport.join() === request.transport.join());
  return from && to && from.id !== to.id ? {from: from.label, to: to.label} : undefined;
}
