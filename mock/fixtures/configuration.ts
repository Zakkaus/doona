import type {RuntimeSettings, ConfigDiagnostic, ConfigSource} from '../../src/api/model';
import {faultRules, rules, type ConfigRule} from '../rules';
import {ago, observedAt, generationId} from './clock';
import {writeTemplate} from '../../src/dae/setup';
import {scanConfig} from '../../src/dae/text';
// Runtime-setting defaults come from configuration; capability values provide their ceilings.
export const runtimeSettings: RuntimeSettings = {
  observed_at: observedAt,
  source: 'config',
  log: {level: 'info', buffered_records: 1024},
  dns_log: {max_records: 2048},
  flows: {max_flows: 4096, retention_seconds: 300},
  recording: {
    flows: {allowed: true, mode: 'auto', active: false},
    logs: {allowed: true, mode: 'auto', active: false},
    dns_log: {allowed: true, mode: 'auto', active: false},
    events: {active: false},
    grace_remaining_seconds: 0
  }
};
// The faults scenario's configuration forbids DNS log recording, so its recorder cannot be switched on.
export const faultSettings: RuntimeSettings = {
  ...runtimeSettings,
  recording: {...runtimeSettings.recording!, dns_log: {allowed: false, mode: 'auto', active: false}}
};

// Initial routing dictionary for fixture flow evidence and stable rule IDs.
type MockConfigRules = {generation_id: string; rules: ConfigRule[]; fallback: {target: string; source: string}};
export const configRules: MockConfigRules = {generation_id: generationId, rules, fallback: {target: 'proxy', source: 'config.dae'}};
export {rules};
const configBase = `global {
  tproxy_port: 12345
  log_level: info
  lan_interface: br-lan
  wan_interface: auto
  allow_insecure: false
  auto_config_kernel_parameter: true
}

subscription {
  harbor: 'https://sub.example.net/api/v1/client/subscribe?token=demo'
}

node {
  'hk-01': 'vless://demo@hk-01.example.net:443?security=tls#hk-01'
  'hk-02': 'vless://demo@hk-02.example.net:443?security=tls#hk-02'
  'sg-01': 'trojan://demo@sg-01.example.net:443#sg-01'
  'jp-01': 'vless://demo@jp-01.example.net:443?security=tls#jp-01'
  'us-01': 'anytls://demo@us-01.example.net:443#us-01'
}

dns {
  upstream {
    cloudflare: 'tls://1.1.1.1:853'
    alidns: 'udp://223.5.5.5:53'
  }
  routing {
    request {
      qname(geosite: category-ads-all) -> reject
      qname(suffix: lan, home.arpa) -> asis
      qtype(HTTPS) && qname(geosite: cn) -> reject
      qname(geosite: cn) -> alidns
      fallback: cloudflare
    }
    response {
      upstream(cloudflare) -> accept
      ip(geoip: private) && !qname(geosite: cn) -> cloudflare
      fallback: accept
    }
  }
}

include {
  rules.dae
  config.d/*.dae
}
`;
const templateConfig = writeTemplate(configBase, 'regions', [], {t: key => key.slice('rule.template.group.'.length)});
const groupEnd = scanConfig(templateConfig).blocks.find(block => block.name === 'group')!.close;
export const configMain =
  templateConfig.slice(0, groupEnd) +
  `  gaming {
    filter: name(jp-01, hk-02)
    policy: min_last_delay
  }
  office {
    policy: fixed(0)
    default: hk-01
  }
  backup {
    filter: subtag(harbor)
    policy: min_moving_avg
  }
` +
  templateConfig.slice(groupEnd);
const configRulesFile = `# Household overrides can be added here.
# This include leaves the selected routing template unchanged.
`;
const configSubscription = `'香港 01 IPLC': 'vless://<redacted>'
'香港 02 BGP': 'vless://<redacted>'
'新加坡 01 2x': 'trojan://<redacted>'
'日本 01 2x': 'vless://<redacted>'
`;
const configGenerated = `# Written by honk from the subscription; edits are lost on refresh.
backup { filter: subtag(harbor) }
`;
// The faults scenario's backend notes.
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
    source_id: 'src-harbor',
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
    id: 'src-auth',
    path: '/etc/honk/config.d/auth.dae',
    kind: 'include',
    writable: false,
    read_only_reason: 'listener_secret_source',
    loaded_at: ago(3600),
    content: "experimental { native_api { secret: '<redacted>' } }\n",
    onDisk: "experimental { native_api { secret: 'demo-listener-secret' } }\n"
  },
  {
    id: 'src-harbor',
    path: '/var/lib/honk/subscriptions/harbor.dae',
    kind: 'subscription',
    writable: false,
    loaded_at: ago(1800),
    content: configSubscription,
    onDisk: configSubscription.replaceAll('<redacted>', 'demo@edge.example.net:443')
  },
  {
    id: 'src-generated',
    path: '/var/lib/honk/generated/backup.dae',
    kind: 'generated',
    writable: false,
    loaded_at: ago(1800),
    content: configGenerated
  }
];
// The faults scenario's sources: rules.dae carries its extra rules.
export const faultSources = configSources.map(source =>
  source.id === 'src-rules'
    ? {
        ...source,
        content:
          source.content + 'mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct\n\n# Ads\n' + faultRules.map(rule => `${rule.cond} -> ${rule.target}\n`).join('')
      }
    : source
);
// The faults scenario's files on disk: someone saved rules.dae after honk loaded it, so writes to it are refused as stale
// until a reload takes the file in.
export const faultDisk = faultSources.map(source =>
  source.id === 'src-rules' ? {...source, content: source.content + 'domain(suffix: example.org) -> direct\n'} : source
);
