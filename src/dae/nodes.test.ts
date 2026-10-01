import {expect, it} from 'vitest';
import {groupsNamingNode, readNodeEntries, writeNodeEntry} from './nodes';

const text = `# keep\r\nnode {\r\n  "old" :  'socks5://127.0.0.1:1080' # node\r\n}\r\ngroup {\r\n  proxy {\r\n    filter: name('old', other) && !name(old) # filter\r\n    filter: name(keyword: old)\r\n    policy: random\r\n  }\r\n}\r\n`;
it('rewrites only the changed node tokens and exact filter arguments', () => {
  const [entry] = readNodeEntries(text);
  expect(entry).toMatchObject({name: 'old', link: 'socks5://127.0.0.1:1080', line: 3});
  expect(groupsNamingNode(text, 'old')).toEqual(['proxy']);
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

it.each(['default', 'final'])('renames exact %s references and detects cross-source blockers', field => {
  const group = `group {\r\n proxy {\r\n  ${field}: 'old' # keep\r\n  policy: fixed(0)\r\n }\r\n}\r\n`;
  const input = text + group;
  const [entry] = readNodeEntries(input);
  expect(groupsNamingNode(group, 'old')).toEqual(['proxy']);
  expect(groupsNamingNode(group, 'other')).toEqual([]);
  expect(writeNodeEntry(input, entry, {name: 'new name', link: entry.link})).toBe(
    writeNodeEntry(text, entry, {name: 'new name', link: entry.link}) + group.replace("'old'", "'new name'")
  );
});
