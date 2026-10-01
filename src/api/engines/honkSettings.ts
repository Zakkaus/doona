import type {SettingsSection} from '../../dae/settings';

// honk-config parser/scalars.rs: only fields actually parsed from global, with their accepted scalar widths.
export const honkGlobal: SettingsSection = {
  name: 'global',
  fields: [
    {key: 'tproxy_port', type: 'integer', max: '65535'},
    {key: 'tproxy_port_protect', type: 'boolean'},
    {key: 'pprof_port', type: 'integer', max: '65535'},
    {key: 'so_mark_from_dae', type: 'integer', max: '1073741823', hexMax: '4294967295'},
    {key: 'log_level', type: 'text', choices: ['trace', 'debug', 'info', 'warn', 'error', 'off']},
    {key: 'log_file', type: 'text'},
    {key: 'disable_waiting_network', type: 'boolean'},
    {key: 'lan_interface', type: 'list', bareItems: true},
    {key: 'wan_interface', type: 'list', bareItems: true},
    {key: 'auto_config_kernel_parameter', type: 'boolean'},
    {key: 'data_dir', type: 'text'},
    {key: 'store_subscribe', type: 'boolean'},
    {key: 'tcp_check_url', type: 'list'},
    {key: 'tcp_check_http_method', type: 'text'},
    {key: 'udp_check_dns', type: 'list'},
    {key: 'check_interval', type: 'duration', units: ['', 'ms', 's', 'm', 'h']},
    {key: 'check_tolerance', type: 'duration', units: ['', 'ms', 's']},
    {key: 'dial_mode', type: 'text', choices: ['ip', 'domain', 'domain+', 'domain++']},
    {key: 'nfqueue_enable', type: 'boolean'},
    {key: 'allow_insecure', type: 'boolean'},
    {key: 'sniffing_timeout', type: 'duration', units: ['', 'ms', 's']},
    {key: 'tls_implementation', type: 'text'},
    {key: 'utls_imitate', type: 'text'},
    {key: 'tls_fragment', type: 'boolean'},
    {key: 'tls_fragment_length', type: 'text'},
    {key: 'tls_fragment_interval', type: 'text'},
    {key: 'mptcp', type: 'boolean'},
    {key: 'bootstrap_resolver', type: 'text'},
    {key: 'fallback_resolver', type: 'text'},
    {key: 'bandwidth_max_tx', type: 'text'},
    {key: 'bandwidth_max_rx', type: 'text'},
    {key: 'udp_warm_node_count', type: 'integer', max: '18446744073709551615'},
    {key: 'preconnect_node_count', type: 'integer', max: '18446744073709551615', choices: ['auto']},
    {key: 'max_concurrent_dials', type: 'integer', max: '18446744073709551615'}
  ]
};
