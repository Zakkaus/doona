import type {Group, RuntimeSettings, ConfigDiagnostic, ConfigSource} from '../../model';
import {rules, type ConfigRule} from '../rules';
import {runtime} from './runtime';
import {ago, observedAt} from './clock';
export const groupPolicies = {
  proxy: {kind: 'selector', native: 'fixed(0)'},
  resilient: {kind: 'urltest', native: 'min_avg10'},
  gaming: {kind: 'urltest', native: 'min_last_delay'},
  skylink: {kind: 'urltest', native: 'min_moving_avg'}
} satisfies Record<string, Group['policy']>;
// Runtime-setting defaults come from configuration; capability values provide their ceilings.
export const runtimeSettings: RuntimeSettings = {
  observed_at: observedAt,
  source: 'config',
  log: {level: 'info', buffered_records: 1024},
  dns_log: {max_records: 2048},
  flows: {max_flows: 4096, retention_seconds: 300},
  recording: {
    flows: {allowed: true, mode: 'auto', active: true},
    logs: {allowed: true, mode: 'auto', active: true},
    dns_log: {allowed: true, mode: 'auto', active: true},
    events: {active: true},
    grace_remaining_seconds: 0
  }
};

// Initial routing dictionary for fixture flow evidence and stable rule IDs.
type MockConfigRules = {generation_id: string; rules: ConfigRule[]; fallback: {target: string; source: string}};
export const configRules: MockConfigRules = {generation_id: runtime.generation.active_id!, rules, fallback: {target: 'resilient', source: 'config.dae:44'}};
export {rules};
const configMain = `global {
  tproxy_port: 12345
  log_level: info
  lan_interface: br-lan
  wan_interface: auto
  allow_insecure: false
  auto_config_kernel_parameter: true
}

subscription {
  sub-c: 'https://sub.example.net/api/v1/client/subscribe?token=demo'
}

node {
  'hk-01': 'vless://demo@hk-01.example.net:443?security=tls#hk-01'
  'hk-02': 'vless://demo@hk-02.example.net:443?security=tls#hk-02'
  'sg-01': 'trojan://demo@sg-01.example.net:443#sg-01'
  'jp-01': 'vless://demo@jp-01.example.net:443?security=tls#jp-01'
  'us-01': 'anytls://demo@us-01.example.net:443#us-01'
}

group {
  proxy { policy: ${groupPolicies.proxy.native} }
  resilient { filter: name(hk-01, sg-01, us-01) policy: ${groupPolicies.resilient.native} }
  gaming { filter: name(jp-01, hk-02) policy: ${groupPolicies.gaming.native} }
  skylink { filter: subtag(sub-c) policy: ${groupPolicies.skylink.native} }
}

dns {
  upstream {
    cloudflare: 'tls://1.1.1.1:853'
    alidns: 'udp://223.5.5.5:53'
  }
  routing {
    request { qname(geosite: cn) -> alidns; fallback: cloudflare }
  }
}

routing {
  domain(suffix: doubleclick.net) -> block
  pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53) -> direct(must)
  dip(geoip: private) -> direct(must)
  domain(geosite: cn) -> direct
  domain(geosite: telegram) -> proxy
  include rules.dae
  fallback: resilient
}
`;
const configRulesFile = `# Household exceptions, kept apart from config.dae.
# The TV never leaves through a node.
mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct

# Chat
domain(geosite: discord) -> proxy
sip(10.0.0.0/24) && dport(25) -> block
`;
const configSubscription = `'香港 01 · IPLC': 'vless://<redacted>'
'香港 02 · BGP': 'vless://<redacted>'
'新加坡 01 · 2x': 'trojan://<redacted>'
'日本 01 · 2x': 'vless://<redacted>'
`;
const configGenerated = `# Written by honk from the subscription; edits are lost on refresh.
skylink { filter: subtag(sub-c) }
`;
export const configNotes: ConfigDiagnostic[] = [
  {
    level: 'warning',
    source_id: 'src-main',
    line: 5,
    column: 3,
    span: null,
    code: 'interface_auto',
    message: 'wan_interface: auto is resolved at start; a changed default route needs a reload'
  },
  {
    level: 'warning',
    source_id: 'src-rules',
    line: 3,
    column: 1,
    span: null,
    code: 'mac_unseen',
    message: 'mac(aa:bb:cc:dd:ee:ff) has not been seen on the LAN since start'
  },
  {
    level: 'info',
    source_id: 'src-sub-c',
    line: 1,
    column: null,
    span: null,
    code: 'subscription_cached',
    message: 'Subscription fetched 30 minutes ago; nodes come from the cache'
  }
];
// Editable sources hash served text; redacted subscriptions retain the on-disk digest and cannot be written back.
export const configSources: Array<Omit<ConfigSource, 'content_sha256' | 'bytes' | 'line_count'> & {content: string; onDisk?: string}> = [
  {id: 'src-main', path: '/etc/honk/config.dae', kind: 'main', writable: true, loaded_at: ago(3600), content: configMain},
  {id: 'src-rules', path: '/etc/honk/rules.dae', kind: 'include', writable: true, loaded_at: ago(3600), content: configRulesFile},
  {
    id: 'src-sub-c',
    path: '/var/lib/honk/subscriptions/sub-c.dae',
    kind: 'subscription',
    writable: false,
    loaded_at: ago(1800),
    content: configSubscription,
    onDisk: configSubscription.replaceAll('<redacted>', 'demo@edge.example.net:443')
  },
  {id: 'src-generated', path: '/var/lib/honk/generated/skylink.dae', kind: 'generated', writable: false, loaded_at: ago(1800), content: configGenerated}
];
