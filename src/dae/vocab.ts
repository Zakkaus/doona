import type {Group} from '../api/model';
import type {Key} from '../i18n';

// The dae configuration vocabulary the engine accepts, as honk's parser spells it (crates/honk-config/src/parser):
// the editor's completions and the demo validator both read from here so they cannot drift apart.
export const globalKeys = [
  'tproxy_port',
  'tproxy_port_protect',
  'pprof_port',
  'so_mark_from_dae',
  'log_level',
  'log_file',
  'disable_waiting_network',
  'lan_interface',
  'wan_interface',
  'auto_config_kernel_parameter',
  'data_dir',
  'store_subscribe',
  'tcp_check_url',
  'tcp_check_http_method',
  'udp_check_dns',
  'check_interval',
  'check_tolerance',
  'dial_mode',
  'nfqueue_enable',
  'allow_insecure',
  'sniffing_timeout',
  'tls_implementation',
  'utls_imitate',
  'tls_fragment',
  'tls_fragment_length',
  'tls_fragment_interval',
  'mptcp',
  'bootstrap_resolver',
  'fallback_resolver',
  'bandwidth_max_tx',
  'bandwidth_max_rx',
  'udp_warm_node_count',
  'preconnect_node_count',
  'max_concurrent_dials'
];
// Group policies: the canonical names first, then the dae spellings the engine maps onto them.
// Which contract kind a native policy expression behaves as, read as honk reads it: the name before `(`, trimmed, in
// ASCII lower case. Undefined for a policy honk does not recognise; honk runs that as a selector and warns, except for
// `honk`, which it rejects as the old name of `score`.
const policyKinds: Record<string, Group['policy']['kind']> = {
  select: 'selector',
  selector: 'selector',
  fixed: 'selector',
  urltest: 'urltest',
  min_moving_avg: 'urltest',
  min_avg10: 'urltest',
  min_last_delay: 'urltest',
  roundrobin: 'loadbalance',
  round_robin: 'loadbalance',
  loadbalance: 'loadbalance',
  balance: 'loadbalance',
  fallback: 'fallback',
  score: 'score'
};
export function policyKind(native: string): Group['policy']['kind'] | undefined {
  const base = native
    .trim()
    .replace(/\(.*$/, '')
    .trim()
    .replace(/[A-Z]/g, letter => letter.toLowerCase());
  return Object.hasOwn(policyKinds, base) ? policyKinds[base] : undefined;
}
// Written out rather than read from policyKinds, so completion keeps to the spellings dae shares. dae's `random` is
// left out: honk reads it as an unknown policy and falls back to a selector.
export const policies = ['select', 'urltest', 'roundrobin', 'fallback', 'score', 'fixed', 'min_moving_avg', 'min_avg10', 'min_last_delay', 'loadbalance'];
// The policies a new group can start with, in the order the picker offers them.
export const newGroupPolicies: Array<{id: string; label: Key; description: Key}> = [
  {id: 'min_moving_avg', label: 'policy.kind.urltest', description: 'arrange.policy.fastestHint'},
  {id: 'score', label: 'policy.kind.score', description: 'arrange.policy.scoreHint'},
  {id: 'fallback', label: 'policy.kind.fallback', description: 'arrange.policy.fallbackHint'},
  {id: 'roundrobin', label: 'arrange.policy.spread', description: 'arrange.policy.spreadHint'},
  {id: 'select', label: 'policy.kind.selector', description: 'arrange.policy.manualHint'}
];
// Built-in outbounds, as nodes, groups and rules name them; a rule may add `(must)`, which keeps DNS traffic from
// being hijacked for that rule.
export const builtinOutboundNames = ['direct', 'block'] as const;
export type BuiltinOutbound = (typeof builtinOutboundNames)[number];
export const builtinOutbounds = [...builtinOutboundNames, ...builtinOutboundNames.map(name => `${name}(must)`)];
// A bare name only: where `(must)` can appear, in rule text, the callers strip or list it themselves.
export const isBuiltinOutbound = (name: string | null | undefined): name is BuiltinOutbound =>
  name != null && (builtinOutboundNames as readonly string[]).includes(name);
