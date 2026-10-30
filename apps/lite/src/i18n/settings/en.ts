export const en = {
  settingsGuideEnabled: 'Enabled',
  settingsGuideDisabled: 'Disabled',
  settingsGuide_lan_interface: 'Intercept forwarded traffic on these LAN interfaces. Default: empty; no LAN hooks.',
  settingsGuide_wan_interface: 'Intercept host-originated traffic on these WAN interfaces. auto follows the lowest-metric IPv4 default route. Default: empty.',
  settingsGuide_tproxy_port: 'TCP and UDP transparent-listener port. Default: 12345.',
  settingsGuide_tproxy_port_protect: 'Compatibility setting; the current runtime does not read it. Default: enabled.',
  settingsGuide_so_mark_from_dae:
    'Socket SO_MARK and exact datapath bypass mark. Default: 0, effective 0x100. Prefer explicit 0x notation; reserved bits 0xc8000000 are rejected.',
  settingsGuide_pprof_port: 'Compatibility setting; honk starts no pprof server. Default: 0.',
  settingsGuide_auto_config_kernel_parameter: 'Compatibility setting; fixed best-effort sysctl setup does not depend on this value. Default: disabled.',
  settingsGuide_disable_waiting_network: 'Compatibility setting; the current startup path does not read it. Default: disabled.',
  settingsGuide_nfqueue_enable:
    'Hold ambiguous forwarded LAN UDP originals in NFQUEUE until a terminal decision. Requires the real eBPF backend. Default: enabled.',
  settingsGuide_log_level: 'Startup log filter. RUST_LOG and --debug take precedence. Default: info.',
  settingsGuide_log_file: 'Append logs to this path; relative paths resolve below data_dir. Console logging stays enabled. Default: empty; no file output.',
  settingsGuide_tcp_check_url: 'The health loop uses the first URL; an empty list uses a plain TCP check. Default: https://www.gstatic.com/generate_204.',
  settingsGuide_tcp_check_http_method: 'HTTP method for URL health checks. Default: HEAD; empty also means HEAD.',
  settingsGuide_udp_check_dns:
    'UDP health-check DNS targets; prefer the first IP literal, otherwise the first domain. Default: Google Public DNS (dns.google:53 with IPv4 and IPv6 addresses).',
  settingsGuide_check_interval: 'Global health-check interval; must be positive. Default: 30s.',
  settingsGuide_check_tolerance: 'Latency improvement required before URLTest switches members. Default: 50ms.',
  settingsGuide_dial_mode:
    'Controls domain discovery, verification, routing and dialing. domain verifies sniffed names against the destination IP. Default: domain.',
  settingsGuide_sniffing_timeout: 'Compatibility setting; the current control plane does not use it. Default: 30ms.',
  settingsGuide_max_concurrent_dials: 'Requested cap on physical proxied connects and handshakes; runtime resource limits may reduce it. Default: 64.',
  settingsGuide_mptcp: 'Compatibility setting; the current dial path does not read it. Default: disabled.',
  settingsGuide_bootstrap_resolver:
    'Marked DNS resolver for node hostnames and control-plane dials. Empty or failed resolution falls back to /etc/hosts, then marked resolv.conf DNS. Default: empty.',
  settingsGuide_fallback_resolver: 'Compatibility setting; the current runtime does not read it. Default: 8.8.8.8:53.',
  settingsGuide_allow_insecure: 'Compatibility setting; certificate verification is configured per node, not here. Default: disabled.',
  settingsGuide_tls_implementation:
    'tls uses the regular BoringSSL profile; utls uses Chrome-oriented ClientHello emulation, not exact browser identity. Default: tls.',
  settingsGuide_utls_imitate: 'Compatibility setting; utls uses one Chrome-oriented profile regardless of this value. Default: chrome_auto.',
  settingsGuide_tls_fragment: 'Compatibility setting; the current TLS connector does not read it. Default: disabled.',
  settingsGuide_tls_fragment_length: 'Compatibility setting; the current TLS connector does not read it. Default: empty.',
  settingsGuide_tls_fragment_interval: 'Compatibility setting; the current TLS connector does not read it. Default: empty.',
  settingsGuide_bandwidth_max_tx: 'Compatibility transmit-bandwidth hint; the current runtime does not read it. Default: empty.',
  settingsGuide_bandwidth_max_rx: 'Compatibility receive-bandwidth hint; the current runtime does not read it. Default: empty.',
  settingsGuide_udp_warm_node_count: 'Per-group UDP warm-candidate count. Default: 0; independent UDP warming is disabled.',
  settingsGuide_preconnect_node_count: 'Warm eligible bare-TCP nodes once at startup. auto selects at most eight; 0 disables warming. Default: auto.',
  settingsGuide_data_dir:
    'Absolute root for generated state and relative runtime assets. An unusable path falls back to the probed working directory. Default: /var/lib/honk.',
  settingsGuide_store_subscribe: 'Persist last valid subscription bodies in data_dir/state/honk.db for startup recovery, not reload. Default: enabled.'
} as const;
export type SettingsMessages = {[K in keyof typeof en]: string};
