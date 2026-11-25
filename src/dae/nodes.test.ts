import {expect, it} from 'vitest';
import {
  appendChainEntry,
  chainHopProblem,
  chainUdpProblem,
  nodeReferenced,
  nodeReferrers,
  readChainEntries,
  readNodeEntries,
  removeChainEntry,
  writeChainEntry,
  writeNodeEntry
} from './nodes';
import {unquote} from './text';

const text = `# keep\r\nnode {\r\n  "old" :  'socks5://127.0.0.1:1080' # node\r\n}\r\ngroup {\r\n  proxy {\r\n    filter: name('old', other) && !name(old) # filter\r\n    filter: name(keyword: old)\r\n    policy: random\r\n  }\r\n}\r\n`;
it('rewrites only the changed node tokens and exact filter arguments', () => {
  const [entry] = readNodeEntries(text);
  expect(entry).toMatchObject({name: 'old', link: 'socks5://127.0.0.1:1080', line: 3});
  expect(nodeReferenced(text, 'old')).toBe(true);
  expect(writeNodeEntry(text, entry, {name: 'new name', link: 'socks5://127.0.0.1:1081'})).toBe(
    text.replace('"old"', "'new name'").replace('1080', '1081').replace("name('old',", "name('new name',").replace('!name(old)', "!name('new name')")
  );
  expect(writeNodeEntry(text, entry, {name: 'old', link: entry.link})).toBe(text);
  expect(writeNodeEntry(text, entry, {name: 'old', link: 'socks5://127.0.0.1:1081'})).toBe(text.replace('1080', '1081'));
});
it('refuses stale, ambiguous and structurally unsafe edits', () => {
  const [entry] = readNodeEntries(text);
  expect(() => writeNodeEntry(text.replace('1080', '1082'), entry, {name: 'new', link: entry.link})).toThrow();
  expect(() => writeNodeEntry(text + text, entry, {name: 'new', link: entry.link})).toThrow();
  expect(() => writeNodeEntry(text, entry, {name: "can't", link: entry.link})).toThrow();
  expect(readNodeEntries("node {\n 'socks5://127.0.0.1:1080'\n wrapper {\n a: 'socks5://127.0.0.1:1080'\n }\n}\n")).toEqual([]);
});

it('quotes a node renamed to mux, which honk would read bare as the removed standalone setting', () => {
  const [entry] = readNodeEntries(text);
  expect(writeNodeEntry(text, entry, {name: 'mux', link: entry.link})).toBe(
    text.replace('"old"', "'mux'").replace("name('old',", 'name(mux,').replace('!name(old)', '!name(mux)')
  );
});

it('quotes ordinary renamed declaration keys while keeping references bare', () => {
  const [entry] = readNodeEntries(text);
  expect(writeNodeEntry(text, entry, {name: 'new', link: entry.link})).toBe(
    text.replace('"old"', "'new'").replace("name('old',", 'name(new,').replace('!name(old)', '!name(new)')
  );
});

it.each(['default', 'final'])('renames exact %s references and detects cross-source blockers', field => {
  const group = `group {\r\n proxy {\r\n  ${field}: 'old' # keep\r\n  policy: fixed(0)\r\n }\r\n}\r\n`;
  const input = text + group;
  const [entry] = readNodeEntries(input);
  expect(nodeReferenced(group, 'old')).toBe(true);
  expect(nodeReferenced(group, 'other')).toBe(false);
  expect(writeNodeEntry(input, entry, {name: 'new name', link: entry.link})).toBe(
    writeNodeEntry(text, entry, {name: 'new name', link: entry.link}) + group.replace("'old'", "'new name'")
  );
});

it.each(['old', "'old'", '"old"'])('renames a DNS upstream detour written as %s without changing other tokens', target => {
  const dns = `dns {\r\n upstream {\r\n  remote: 'tcp://1.1.1.1:53' -> ${target} # keep -> old\r\n  other: 'udp://1.0.0.1:53' -> older\r\n  plain: 'udp://old:53'\r\n }\r\n routing {\r\n  request {\r\n   fallback: old\r\n  }\r\n }\r\n}\r\n`;
  const input = text + dns;
  const [entry] = readNodeEntries(input);
  expect(writeNodeEntry(input, entry, {name: 'new name', link: entry.link})).toBe(
    writeNodeEntry(text, entry, {name: 'new name', link: entry.link}) + dns.replace(`-> ${target} #`, "-> 'new name' #")
  );
});

it.each(['xhttp', 'splithttp'])('preserves raw %s links through source reads and edits', transport => {
  const link = `vless://00000000-0000-4000-8000-000000000001@example.com:443?security=tls&type=${transport}&path=%2Fx%252Fy&extra=%7B%22headers%22%3A%7B%22X-Test%22%3A%22a%2Bb%22%7D%7D#edge`;
  const source = `# keep\r\nnode {\r\n  edge: '${link}' # keep\r\n}\r\n`;
  const [entry] = readNodeEntries(source);
  expect(entry.link).toBe(link);
  expect(writeNodeEntry(source, entry, {name: entry.name, link})).toBe(source);
  const updated = link.replace('%2Fx%252Fy', '%2Fnew%252Fpath');
  const written = writeNodeEntry(source, entry, {name: entry.name, link: updated});
  expect(written).toBe(source.replace(link, updated));
  expect(readNodeEntries(written)[0].link).toBe(updated);
});

it.each([
  ['bare hops', 'a: b -> c # keep -> d', ['b', 'c']],
  ['an unquoted hop with a colon and a space', "a: hk: east -> 'hop b' -> c", ['hk: east', 'hop b', 'c']],
  ['quoted hops holding an arrow, a scheme and a hash', `a: 'x -> y' -> "socks5://z" -> 'p # q'`, ['x -> y', 'socks5://z', 'p # q']],
  ['flush arrows', 'a: b->c', ['b', 'c']],
  ['an empty hop', 'a: b -> -> c', ['b', '', 'c']],
  ['a share link', 'a: socks5://h:1 -> b', null],
  ['a quoted share link', "a: 'socks5://h:1'", null],
  ['a value without an arrow', 'a: b', null]
])('reads a chain from %s', (_, line, hops) => {
  const source = `node {\n  ${line}\n}\n`;
  const chains = readChainEntries(source);
  if (!hops) return expect(chains).toEqual([]);
  expect(chains).toMatchObject([{name: 'a', line: 2, hops: hops.map(name => ({name}))}]);
  // Each hop's range covers its written text, quotes included and comment excluded.
  expect(chains[0].hops.map(hop => unquote(source.slice(hop.from, hop.to)))).toEqual(hops);
  expect(source.slice(chains[0].from, chains[0].to)).toBe(line.replace(/ # keep.*/, ''));
  expect(readNodeEntries(source)).toEqual([]);
});

it.each([
  ['a group exit', 'group {\n proxy {\n  exit: old # keep\n }\n}\n', "group {\n proxy {\n  exit: 'new name' # keep\n }\n}\n", [{kind: 'group', name: 'proxy'}]],
  ['chain hops', "node {\n  c: x -> 'old' -> old # old\n}\n", "node {\n  c: x -> 'new name' -> 'new name' # old\n}\n", [{kind: 'chain', name: 'c'}]],
  [
    'a DNS upstream',
    "dns {\n upstream {\n  remote: 'tcp://1.1.1.1:53' -> old\n }\n}\n",
    "dns {\n upstream {\n  remote: 'tcp://1.1.1.1:53' -> 'new name'\n }\n}\n",
    [{kind: 'dns', name: 'remote'}]
  ],
  ['no chain hop', 'node {\n  c: socks5://old:1 -> old\n  d: x -> older\n}\n', null, []]
])('renames and reports a node named in %s', (_, extra, renamed, referrers) => {
  const input = text + extra;
  const [entry] = readNodeEntries(input);
  expect(nodeReferrers(extra, 'old')).toEqual(referrers);
  expect(writeNodeEntry(input, entry, {name: 'new name', link: entry.link})).toBe(
    writeNodeEntry(text, entry, {name: 'new name', link: entry.link}) + (renamed ?? extra)
  );
});

it.each([
  ['its own line and comment', 'node {\n  a: x\n  c: x -> y # keep\n  b: z\n}\n', 'node {\n  a: x\n  b: z\n}\n'],
  ['a CRLF line', 'node {\r\n  c: x -> y\r\n  b: z\r\n}\r\n', 'node {\r\n  b: z\r\n}\r\n'],
  ['a one-line block', 'node { c: x -> y }\n', 'node {  }\n']
])('removes a chain on %s', (_, source, removed) => {
  const [chain] = readChainEntries(source);
  expect(removeChainEntry(source, chain)).toBe(removed);
  expect(() => removeChainEntry(source.replace('-> y', '-> w'), chain)).toThrow();
  expect(() => removeChainEntry(source + source, chain)).toThrow();
});

const chainSource = "node {\n    a: 'socks5://a:1'\n    via: a -> 'hk: east' # keep\n}\ngroup {\n  proxy {\n    filter: name(via)\n    final: via\n  }\n}\n";
it.each([
  ['the hops', {name: 'via', hops: ['a', 'b c', 'd']}, chainSource.replace("a -> 'hk: east'", "a -> 'b c' -> d")],
  [
    'the name, and what names it',
    {name: 'new via', hops: ['a', 'hk: east']},
    chainSource.replace('via:', "'new via':").replace(/via\n/g, "'new via'\n").replace('name(via)', "name('new via')")
  ],
  ['nothing', {name: 'via', hops: ['a', 'hk: east']}, chainSource]
])('writes a chain with %s changed', (_, next, written) => {
  const [chain] = readChainEntries(chainSource);
  expect(writeChainEntry(chainSource, chain, next)).toBe(written);
});

it.each([
  ['a stale chain', chainSource.replace("'hk: east'", 'b'), {name: 'via', hops: ['a', 'b']}],
  ['a taken name', chainSource, {name: 'a', hops: ['a', 'b']}],
  ['one hop', chainSource, {name: 'via', hops: ['a']}],
  ['five hops', chainSource, {name: 'via', hops: ['a', 'b', 'c', 'd', 'e']}],
  ['an empty hop', chainSource, {name: 'via', hops: ['a', '']}],
  ['an unquotable hop', chainSource, {name: 'via', hops: ['a', "it's"]}]
])('refuses to write %s', (_, source, next) => {
  const [chain] = readChainEntries(chainSource);
  expect(() => writeChainEntry(source, chain, next)).toThrow();
});

it.each([
  [
    'the last node block, indented as its entries',
    "node {\n    a: 'socks5://a:1'\n}\nnode {\n\tb: 'socks5://b:1' # b\n}\n",
    "node {\n    a: 'socks5://a:1'\n}\nnode {\n\tb: 'socks5://b:1' # b\n\t'new': a -> 'b c'\n}\n"
  ],
  ['an empty node block', 'node {\n}\n', "node {\n  'new': a -> 'b c'\n}\n"],
  ['a new node block', 'global {\n}\n\n', "global {\n}\n\nnode {\n  'new': a -> 'b c'\n}\n"],
  ['an empty source', '', "node {\n  'new': a -> 'b c'\n}\n"],
  ['a CRLF file', "node {\r\n  a: 'x://h'\r\n}\r\n", "node {\r\n  a: 'x://h'\r\n  'new': a -> 'b c'\r\n}\r\n"],
  ['a block closed after its last entry', "node {\n  a: 'x://h' }\n", "node {\n  a: 'x://h'\n  'new': a -> 'b c'\n}\n"],
  ['a one-line block', "node { a: 'x://h' }\n", "node { a: 'x://h'\n  'new': a -> 'b c'\n}\n"]
])('appends a chain to %s', (_, source, appended) => {
  expect(appendChainEntry(source, {name: 'new', hops: ['a', 'b c']})).toBe(appended);
  expect(readChainEntries(appended).at(-1)).toMatchObject({name: 'new', hops: [{name: 'a'}, {name: 'b c'}]});
  expect(() => appendChainEntry(appended, {name: 'new', hops: ['a', 'b']})).toThrow();
});

const catalog = [
  {name: 'ss', protocol: 'ss'},
  {name: 'hy', protocol: 'hysteria2'},
  {name: 'trojan', protocol: 'trojan'},
  {name: 'vmess', protocol: 'vmess'},
  {name: 'xhttp', protocol: 'vless', stream_transport: 'xhttp' as const},
  {name: 'via', protocol: 'chain'},
  {name: 'direct', protocol: 'direct'},
  {name: 'twice', protocol: 'ss'},
  {name: 'twice', protocol: 'ss'}
];
it.each([
  ['missing', 0, 'invalid-chain-hop-reference'],
  ['twice', 1, 'ambiguous-chain-hop-reference'],
  ['hy', 0, null],
  ['hy', 1, 'unsupported-chain-hop'],
  ['xhttp', 0, null],
  ['xhttp', 2, 'unsupported-chain-hop'],
  ['trojan', 3, null],
  ['vmess', 1, null],
  ['via', 0, 'unsupported-chain-hop'],
  ['direct', 0, 'unsupported-chain-hop']
])('checks hop %s at position %i', (name, index, code) => {
  expect(chainHopProblem(catalog, name, index)).toBe(code);
});

it.each([
  [['ss', 'trojan'], null],
  [['hy', 'trojan'], {kind: 'hop', name: 'hy'}],
  [['ss', 'xhttp'], {kind: 'hop', name: 'xhttp'}],
  [['trojan', 'ss'], {kind: 'exit', name: 'ss'}],
  [['ss', 'vmess'], {kind: 'exit', name: 'vmess'}]
])('rules out UDP through %j by protocol: %j', (hops, problem) => {
  expect(chainUdpProblem(hops.map(name => catalog.find(node => node.name === name)!))).toEqual(problem);
});
