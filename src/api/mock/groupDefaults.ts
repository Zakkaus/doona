import type {Group} from '../model';

// A group's settings where its configuration names none; each call returns a new object for the caller to fill in.
// A group that tests its members also goes idle, so the idle timeout has a value to show and edit.
export function groupConfig(kind: Group['policy']['kind'], defaultMemberId: string | null): Group['config'] {
  return {
    default_member_id: defaultMemberId,
    final_outbound: null,
    check_url: null,
    check_interval: 30,
    tolerance: 10,
    idle_timeout: kind === 'selector' ? null : 1800,
    interrupt_connections: false
  };
}
export function groupCapabilities(kind: Group['policy']['kind']): Group['capabilities'] {
  return {
    can_select: kind === 'selector',
    can_override: kind !== 'selector',
    supports_nested_groups: true,
    mutable_config: [
      'policy',
      'default_member_id',
      ...(kind === 'selector' ? [] : (['check_url', 'idle_timeout'] as const)),
      'tolerance',
      'interrupt_connections'
    ],
    probe_transports: ['tcp', 'udp']
  };
}
