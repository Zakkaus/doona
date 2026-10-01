// The demo starts with these examples; sharing the text keeps setup detection aligned with its fixtures.
export const demoRouting = `routing {
  pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53) -> direct(must)
  dip(geoip: private) -> direct(must)
  domain(suffix: doubleclick.net) -> block
  domain(geosite: cn) -> direct
  domain(geosite: telegram) -> proxy
  include rules.dae
  fallback: auto
}`;
export const demoRoutingInclude = `# Household exceptions, kept apart from config.dae.
# The TV never leaves through a node.
mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct

# AI
domain(geosite: openai) -> proxy
sip(10.0.0.0/24) && dport(25) -> block
`;
