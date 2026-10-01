import {isBareName, isQuotable, quote, scanConfig, unquote} from './text';

export type DnsUpstreamEntry = {name: string; address: string; from: number; nameTo: number; to: number; valueFrom: number; valueTo: number};
export function readDnsUpstreams(text: string): DnsUpstreamEntry[] {
  const scan = scanConfig(text);
  return scan.blocks
    .filter(block => block.name === 'dns')
    .flatMap(dns => dns.children.filter(block => block.name === 'upstream'))
    .flatMap(block => {
      const tokens = scan.tokens.filter(token => token.from > block.open && token.to <= block.close && token.kind !== 'comment');
      const rows: DnsUpstreamEntry[] = [];
      for (let i = 0; i < tokens.length - 2; i++) {
        const key = tokens[i];
        const value = tokens[i + 2];
        if ((i > 0 && tokens[i - 1].line === key.line) || text.slice(tokens[i + 1].from, tokens[i + 1].to) !== ':') continue;
        let end = value.to;
        if (value.kind !== 'quoted')
          for (const token of tokens.slice(i + 3)) {
            if (token.from !== end || ['->', '}'].includes(text.slice(token.from, token.to))) break;
            end = token.to;
          }
        const address = unquote(text.slice(value.from, end));
        if (!validDnsAddress(address)) continue;
        const to = Math.max(end, ...tokens.filter(token => token.line === key.line && token.from >= key.from).map(token => token.to));
        rows.push({name: text.slice(key.from, key.to), address, from: key.from, nameTo: key.to, valueFrom: value.from, valueTo: end, to});
      }
      return rows.map((row, i) => ({...row, to: Math.min(row.to, rows[i + 1]?.from ?? row.to)}));
    });
}
export function validDnsAddress(address: string): boolean {
  if (!isQuotable(address) || /\s/.test(address)) return false;
  try {
    const url = new URL(address.includes('://') ? address : `udp://${address}`);
    return ['udp:', 'tcp:', 'tcp+udp:', 'udp+tcp:', 'tls:', 'https:', 'quic:', 'h3:', 'http3:'].includes(url.protocol) && !!url.hostname;
  } catch {
    return false;
  }
}
export const validUpstreamName = (name: string) => isBareName(name) && name === name.toLowerCase() && !['asis', 'reject', 'accept'].includes(name);

// Only DNS routing targets and upstream() arguments refer to upstream names; comments and other sections do not.
export function renameDnsReferences(text: string, name: string, next: string): string {
  const scan = scanConfig(text);
  const edits: Array<{from: number; to: number}> = [];
  for (const dns of scan.blocks.filter(block => block.name === 'dns')) {
    for (const routing of dns.children.filter(block => block.name === 'routing')) {
      const tokens = scan.tokens.filter(token => token.from > routing.open && token.to <= routing.close && token.kind !== 'comment');
      const raw = (i: number) => (tokens[i] ? text.slice(tokens[i].from, tokens[i].to) : '');
      let upstream = false;
      for (let i = 0; i < tokens.length; i++) {
        if (raw(i) === '(') upstream = raw(i - 1) === 'upstream';
        if (raw(i) === ')') upstream = false;
        if (
          (upstream ? raw(i) === name : raw(i).toLowerCase() === name) &&
          (upstream || raw(i - 1) === '->' || (raw(i - 1) === ':' && ['fallback', 'default'].includes(raw(i - 2))))
        )
          edits.push(tokens[i]);
      }
    }
  }
  return edits.reverse().reduce((out, at) => out.slice(0, at.from) + next + out.slice(at.to), text);
}
export function editDnsUpstream(text: string, old: string, name: string, address: string): string | null {
  const entry = readDnsUpstreams(text).find(entry => entry.name === old);
  if (!entry || !validUpstreamName(name) || !validDnsAddress(address)) return null;
  const changed = address === entry.address ? text : text.slice(0, entry.valueFrom) + quote(address) + text.slice(entry.valueTo);
  return changed.slice(0, entry.from) + name + changed.slice(entry.nameTo);
}
export function addDnsUpstream(text: string, name: string, address: string): string | null {
  if (!validUpstreamName(name) || !validDnsAddress(address)) return null;
  const dns = scanConfig(text).blocks.find(block => block.name === 'dns');
  const upstream = dns?.children.find(block => block.name === 'upstream');
  const line = `    ${name}: ${quote(address)}\n`;
  const routing =
    !dns?.children.some(block => block.name === 'routing') && !readDnsUpstreams(text).length
      ? `  routing {\n    request {\n      fallback: ${name}\n    }\n  }\n`
      : '';
  const initialized = dns && routing ? text.slice(0, dns.close) + `\n${routing}` + text.slice(dns.close) : text;
  if (upstream) return initialized.slice(0, upstream.close) + `\n${line}  ` + initialized.slice(upstream.close);
  if (dns) return initialized.slice(0, dns.close) + `\n  upstream {\n${line}  }\n` + initialized.slice(dns.close);
  return text + `\ndns {\n  upstream {\n${line}  }\n${routing}}\n`;
}

export function aliasDnsUpstream(text: string, old: string, name: string, address: string): string | null {
  const entry = readDnsUpstreams(text).find(entry => entry.name === old);
  if (!entry || !validUpstreamName(name) || !validDnsAddress(address)) return null;
  const value = address === entry.address ? text.slice(entry.valueFrom, entry.valueTo) : quote(address);
  const alias = name + text.slice(entry.nameTo, entry.valueFrom) + value + text.slice(entry.valueTo, entry.to);
  return text.slice(0, entry.to) + `\n    ${alias}` + text.slice(entry.to);
}
export function removeDnsUpstream(text: string, name: string): string | null {
  const entry = readDnsUpstreams(text).find(entry => entry.name === name);
  return entry ? text.slice(0, entry.from) + text.slice(entry.to) : null;
}
