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
export const policies = ['select', 'urltest', 'roundrobin', 'fallback', 'score', 'fixed', 'min_moving_avg', 'min_avg10', 'min_last_delay', 'loadbalance'];
// Built-in outbounds; `(must)` keeps DNS traffic from being hijacked for that rule.
export const builtinOutbounds = ['direct', 'block', 'direct(must)', 'block(must)'];
