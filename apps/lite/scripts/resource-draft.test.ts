import {describe, expect, it} from 'vitest';
import {changeResource, draftResources} from '../src/resourceDraft';
import {changeGroupText, groupDraftEntry} from '../src/groupDraft';
const source = `# keep this note
node {
  first: 'anytls://secret@one.example:443#First'
  spare: 'anytls://secret@two.example:443#Spare'
}
subscription {
  feed: 'https://example.net/feed' {
    ua: 'custom-agent'
    interval: 3600s
  }
}
group {
  proxy {
    filter: name(first)
    policy: select
  }
}
`;
describe('orchestration resource drafts', () => {
  it('keeps an untouched group body byte for byte and copies every field', () => {
    const entry = groupDraftEntry(source, 'proxy')!;
    const body = source.slice(entry.open + 1, entry.close);
    expect(changeGroupText(source, [], 'proxy', 'proxy', body, false)).toBe(source);
    const next = changeGroupText(source, [], 'proxy', 'proxy-copy', body, true);
    const copied = groupDraftEntry(next, 'proxy-copy')!;
    expect(next.slice(copied.open + 1, copied.close)).toBe(body);
    expect(next).toContain(source.slice(entry.from, entry.to));
  });
  it('refuses group block escapes, duplicate names and implicit renames', () => {
    expect(() => changeGroupText(source, [], 'proxy', 'proxy', '}\nrouting {\n', false)).toThrow();
    expect(() => changeGroupText(source, [], 'proxy', 'proxy', '\npolicy: select\n', true)).toThrow();
    expect(() => changeGroupText(source, [], 'proxy', 'renamed', '\npolicy: select\n', false)).toThrow();
    expect(() => changeGroupText(source, ['group { proxy-copy {} }'], 'proxy', 'proxy-copy', '\n', true)).toThrow();
  });
  it('duplicates a node while preserving the original source byte for byte', () => {
    const link = draftResources(source, 'node')[0].value;
    const next = changeResource(source, [], 'node', 'duplicate', 'first', 'copied', link);
    expect(draftResources(next, 'node').map(entry => entry.name)).toEqual(['first', 'spare', 'copied']);
    expect(next.replace(`  'copied': '${link}'\n`, '')).toBe(source);
  });
  it.each(['node', 'subscription'] as const)('duplicates an inline %s entry onto its own line', kind => {
    const value = kind === 'node' ? 'anytls://secret@one.example:443' : 'https://example.net/feed';
    const original = `${kind} { first: '${value}' }\n`;
    const next = changeResource(original, [], kind, 'duplicate', 'first', 'copied', value);
    expect(draftResources(next, kind).map(entry => [entry.name, entry.value])).toEqual([
      ['first', value],
      ['copied', value]
    ]);
  });
  it('changes only the chosen link', () => {
    const next = changeResource(source, [], 'node', 'text', 'first', 'first', 'anytls://new@one.example:443');
    expect(next).toBe(source.replace('anytls://secret@one.example:443#First', 'anytls://new@one.example:443'));
  });
  it('preserves subscription options in a duplicate', () => {
    const next = changeResource(source, [], 'subscription', 'duplicate', 'feed', 'feed-copy', 'https://example.net/copy');
    expect(draftResources(next, 'subscription').map(entry => entry.name)).toEqual(['feed', 'feed-copy']);
    expect(next.match(/custom-agent/g)).toHaveLength(2);
    expect(next.match(/interval: 3600s/g)).toHaveLength(2);
    expect(next).toContain('https://example.net/copy');
  });
  it('refuses referenced deletion in the draft or included sources', () => {
    expect(() => changeResource(source, [], 'node', 'delete', 'first', 'first', '')).toThrow();
    expect(() => changeResource(source, ['group {\n use {\n filter: subtag(feed)\n }\n}'], 'subscription', 'delete', 'feed', 'feed', '')).toThrow();
  });
  it('removes an unreferenced node from the draft', () => {
    expect(draftResources(changeResource(source, [], 'node', 'delete', 'spare', 'spare', ''), 'node').map(entry => entry.name)).toEqual(['first']);
  });
  it('refuses ambiguous declarations and collisions across sources', () => {
    const other = "node {\n first: 'anytls://x@host:443'\n other: 'anytls://x@host:443'\n}";
    expect(() => changeResource(source, [other], 'node', 'delete', 'first', 'first', '')).toThrow();
    expect(() => changeResource(source, [other.replace('first:', 'different:')], 'node', 'duplicate', 'first', 'other', 'anytls://x@host:443')).toThrow();
  });
  it('refuses implicit renames and invalid subscription URLs', () => {
    expect(() => changeResource(source, [], 'node', 'form', 'first', 'renamed', 'anytls://x@host:443')).toThrow();
    expect(() => changeResource(source, [], 'subscription', 'form', 'feed', 'feed', 'file:///etc/passwd')).toThrow();
  });
});
