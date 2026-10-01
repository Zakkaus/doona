import type {SettingsSection} from '../../dae/settings';

// honk-config parser/scalars.rs: only fields actually parsed from global, with their accepted scalar widths.
export const honkGlobal: SettingsSection = {
  name: 'global',
  fields: [
    {key: 'lan_interface', label: 'config.global.lan_interface', group: 'interfaces', type: 'list', bareItems: true},
    {key: 'wan_interface', label: 'config.global.wan_interface', group: 'interfaces', type: 'list', bareItems: true},
    {key: 'tproxy_port', label: 'config.global.tproxy_port', group: 'interfaces', type: 'integer', max: '65535'},
    {key: 'tproxy_port_protect', label: 'config.global.tproxy_port_protect', group: 'interfaces', type: 'boolean'},
    {key: 'so_mark_from_dae', label: 'config.global.so_mark_from_dae', group: 'interfaces', type: 'integer', max: '1073741823', hexMax: '4294967295'},
    {key: 'pprof_port', label: 'config.global.pprof_port', group: 'interfaces', type: 'integer', max: '65535'},
    {key: 'auto_config_kernel_parameter', label: 'config.global.auto_config_kernel_parameter', group: 'interfaces', type: 'boolean'},
    {key: 'disable_waiting_network', label: 'config.global.disable_waiting_network', group: 'interfaces', type: 'boolean'},
    {key: 'nfqueue_enable', label: 'config.global.nfqueue_enable', group: 'interfaces', type: 'boolean'},
    {key: 'log_level', label: 'config.global.log_level', group: 'logging', type: 'text', choices: ['trace', 'debug', 'info', 'warn', 'error', 'off']},
    {key: 'log_file', label: 'config.global.log_file', group: 'logging', type: 'text'},
    {key: 'tcp_check_url', label: 'config.global.tcp_check_url', group: 'checks', type: 'list'},
    {key: 'tcp_check_http_method', label: 'config.global.tcp_check_http_method', group: 'checks', type: 'text'},
    {key: 'udp_check_dns', label: 'config.global.udp_check_dns', group: 'checks', type: 'list'},
    {key: 'check_interval', label: 'config.global.check_interval', group: 'checks', type: 'duration', units: ['', 'ms', 's', 'm', 'h']},
    {key: 'check_tolerance', label: 'config.global.check_tolerance', group: 'checks', type: 'duration', units: ['', 'ms', 's']},
    {key: 'dial_mode', label: 'config.global.dial_mode', group: 'dialing', type: 'text', choices: ['ip', 'domain', 'domain+', 'domain++']},
    {key: 'sniffing_timeout', label: 'config.global.sniffing_timeout', group: 'dialing', type: 'duration', units: ['', 'ms', 's']},
    {key: 'max_concurrent_dials', label: 'config.global.max_concurrent_dials', group: 'dialing', type: 'integer', max: '18446744073709551615'},
    {key: 'mptcp', label: 'config.global.mptcp', group: 'dialing', type: 'boolean'},
    {key: 'bootstrap_resolver', label: 'config.global.bootstrap_resolver', group: 'dialing', type: 'text'},
    {key: 'fallback_resolver', label: 'config.global.fallback_resolver', group: 'dialing', type: 'text'},
    {key: 'allow_insecure', label: 'config.global.allow_insecure', group: 'dialing', type: 'boolean'},
    {key: 'tls_implementation', label: 'config.global.tls_implementation', group: 'dialing', type: 'text'},
    {key: 'utls_imitate', label: 'config.global.utls_imitate', group: 'dialing', type: 'text'},
    {key: 'tls_fragment', label: 'config.global.tls_fragment', group: 'dialing', type: 'boolean'},
    {key: 'tls_fragment_length', label: 'config.global.tls_fragment_length', group: 'dialing', type: 'text'},
    {key: 'tls_fragment_interval', label: 'config.global.tls_fragment_interval', group: 'dialing', type: 'text'},
    {key: 'bandwidth_max_tx', label: 'config.global.bandwidth_max_tx', group: 'bandwidth', type: 'text'},
    {key: 'bandwidth_max_rx', label: 'config.global.bandwidth_max_rx', group: 'bandwidth', type: 'text'},
    {key: 'udp_warm_node_count', label: 'config.global.udp_warm_node_count', group: 'bandwidth', type: 'integer', max: '18446744073709551615'},
    {
      key: 'preconnect_node_count',
      label: 'config.global.preconnect_node_count',
      group: 'bandwidth',
      type: 'integer',
      max: '18446744073709551615',
      choices: ['auto']
    },
    {key: 'data_dir', label: 'config.global.data_dir', group: 'storage', type: 'text'},
    {key: 'store_subscribe', label: 'config.global.store_subscribe', group: 'storage', type: 'boolean'}
  ]
};
