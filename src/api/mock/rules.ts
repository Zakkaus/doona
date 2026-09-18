// The routing rules the demo's trace and flow evidence refer to, in config order.
export type ConfigRule = {id: string; cond: string; target: string; must: boolean};
export const rules: ConfigRule[] = [
  {id: 'r1', cond: 'domain(suffix: doubleclick.net)', target: 'block', must: false},
  {id: 'r2', cond: 'pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53)', target: 'direct', must: true},
  {id: 'r3', cond: 'dip(geoip: private)', target: 'direct', must: true},
  {id: 'r4', cond: 'domain(geosite: cn)', target: 'direct', must: false},
  {id: 'r5', cond: 'domain(geosite: telegram)', target: 'proxy', must: false},
  {id: 'r6', cond: 'mac(aa:bb:cc:dd:ee:ff) && ipversion(4)', target: 'direct', must: false},
  {id: 'r7', cond: 'domain(geosite: discord)', target: 'proxy', must: false},
  {id: 'r8', cond: 'sip(10.0.0.0/24) && dport(25)', target: 'block', must: false}
];
