// The quick-start wizard writes a whole dae main source from a subscription URL and a few choices. It is a
// template, not a parser: the URL goes into `subscription` untouched and the engine fetches and reads it.
export type WizardInput = {
  subscription: string;
  group: string;
  policy: 'auto' | 'manual';
  template: 'domestic' | 'global';
  lanInterface: string;
};

export const templates: Record<WizardInput['template'], string[]> = {
  // Mainland China and the LAN go direct, adverts are dropped, everything else leaves through the group.
  domestic: ['domain(geosite: category-ads-all) -> block', 'dip(geoip: private) -> must_direct', 'domain(geosite: cn) -> direct', 'dip(geoip: cn) -> direct'],
  // Only the LAN stays local; every other destination leaves through the group.
  global: ['dip(geoip: private) -> must_direct']
};

const name = (value: string) => value.trim().replace(/[^\w-]/g, '-') || 'proxy';
const quote = (value: string) => "'" + value.replace(/'/g, '') + "'";

export function buildConfig(input: WizardInput): string {
  const group = name(input.group);
  const policy = input.policy === 'auto' ? 'min_moving_avg' : 'fixed(0)';
  return [
    'global {',
    '  tproxy_port: 12345',
    '  log_level: info',
    `  lan_interface: ${input.lanInterface.trim() || 'auto'}`,
    '  wan_interface: auto',
    '  allow_insecure: false',
    '  auto_config_kernel_parameter: true',
    '}',
    '',
    'subscription {',
    `  sub: ${quote(input.subscription.trim())}`,
    '}',
    '',
    'group {',
    `  ${group} { filter: subtag(sub) policy: ${policy} }`,
    '}',
    '',
    'dns {',
    '  upstream {',
    "    cloudflare: 'tls://1.1.1.1:853'",
    "    alidns: 'udp://223.5.5.5:53'",
    '  }',
    '  routing {',
    '    request { qname(geosite: cn) -> alidns; fallback: cloudflare }',
    '  }',
    '}',
    '',
    'routing {',
    ...templates[input.template].map(rule => '  ' + rule),
    `  fallback: ${group}`,
    '}',
    ''
  ].join('\n');
}

export const isSubscriptionUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim());
