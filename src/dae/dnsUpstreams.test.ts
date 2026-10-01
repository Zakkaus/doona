import {expect, it} from 'vitest';
import {
  addDnsUpstream,
  aliasDnsUpstream,
  editDnsUpstream,
  readDnsUpstreams,
  removeDnsUpstream,
  renameDnsReferences,
  validDnsAddress,
  validUpstreamName
} from './dnsUpstreams';

const text = `# primary stays in this comment
routing { fallback: direct }
dns {
  upstream {
    primary: 'udp://223.5.5.5:53' -> direct # keep detour
    backup: https://dns.google/dns-query
  }
  routing {
    request {
      qname(full: primary) -> primary # primary
      fallback: backup
    }
    response {
      upstream(primary, backup) && ip(1.1.1.1) -> primary
      default: accept
    }
  }
}
`;
it('edits only the upstream name and address and its DNS references', () => {
  expect(readDnsUpstreams(text).map(({name, address}) => ({name, address}))).toEqual([
    {name: 'primary', address: 'udp://223.5.5.5:53'},
    {name: 'backup', address: 'https://dns.google/dns-query'}
  ]);
  const edited = editDnsUpstream(text, 'primary', 'local', 'tcp://1.1.1.1:53')!;
  const renamed = renameDnsReferences(edited, 'primary', 'local');
  expect(renamed).toBe(
    text
      .replace("primary: 'udp://223.5.5.5:53'", "local: 'tcp://1.1.1.1:53'")
      .replaceAll('-> primary', '-> local')
      .replace('upstream(primary,', 'upstream(local,')
  );
});
it('keeps the original upstream and detour while references in other files are migrated', () => {
  const staged = aliasDnsUpstream(text, 'primary', 'local', 'tls://1.1.1.1:853')!;
  expect(staged).toContain("local: 'tls://1.1.1.1:853' -> direct");
  expect(readDnsUpstreams(staged)).toHaveLength(3);
  const final = renameDnsReferences(removeDnsUpstream(staged, 'primary')!, 'primary', 'local');
  expect(final).toContain('# keep detour');
  expect(readDnsUpstreams(final).map(row => row.name)).toEqual(['local', 'backup']);
});
it('adds an upstream with and without existing DNS blocks and refuses structural input', () => {
  for (const before of ['', 'dns {\n}\n', 'dns {\n upstream {\n }\n}\n', text])
    expect(readDnsUpstreams(addDnsUpstream(before, 'local', 'udp://1.1.1.1:53')!)).toContainEqual(expect.objectContaining({name: 'local'}));
  expect(validUpstreamName('bad\nname')).toBe(false);
  expect(validDnsAddress("udp://1.1.1.1'\n}")).toBe(false);
  expect(validDnsAddress('file:///etc/passwd')).toBe(false);
});

it('reads all supported DNS transports and matches case-insensitive actions and case-sensitive conditions', () => {
  for (const address of ['1.1.1.1:53', '[::1]:53', 'udp+tcp://1.1.1.1:53', 'h3://dns.google/dns-query', 'http3://dns.google/dns-query']) {
    expect(validDnsAddress(address)).toBe(true);
    expect(readDnsUpstreams(`dns {\n upstream {\n local: '${address}'\n }\n}`)[0]?.address).toBe(address);
  }
  expect(renameDnsReferences('dns { routing { request { fallback: Primary } } }', 'primary', 'local')).toContain('fallback: local');
});

it('requires lowercase names because DNS actions normalize their targets', () => {
  expect(validUpstreamName('Primary')).toBe(false);
  expect(validUpstreamName('default')).toBe(true);
  expect(renameDnsReferences('dns { routing { response { upstream(Primary) -> accept } } }', 'primary', 'local')).toContain('upstream(Primary)');
});

it('preserves the address spelling when only the name changes', () => {
  expect(editDnsUpstream(text, 'backup', 'secondary', 'https://dns.google/dns-query')).toBe(text.replace('backup:', 'secondary:'));
  expect(aliasDnsUpstream(text, 'backup', 'secondary', 'https://dns.google/dns-query')).toContain('secondary: https://dns.google/dns-query');
});

it('keeps legacy outbound detours out of the upstream list', () => {
  const legacy = 'dns {\n upstream {\n local: 1.1.1.1:53 outbound: direct\n }\n}\n';
  expect(readDnsUpstreams(legacy).map(row => row.name)).toEqual(['local']);
  expect(editDnsUpstream(legacy, 'local', 'backup', '1.1.1.1:53')).toBe(legacy.replace('local:', 'backup:'));
});
