import {describe, expect, it} from 'vitest';
import {readSubscriptionEntries, writeSubscriptionEntry} from './subscriptions';
import {addSubtagsToGroup, classifyFilters, readGroupEntries, removeSubtagsFromGroup} from './groups';
import {LocalError} from '../api/error';

const text = `subscription {
  # the paid one
  short: 'https://example.com/sub' # keep me
  agent: 'https://example.net/sub'(honk/1.0 like)
  'https://example.org/no_tag_link'
  old: {
    url: 'https://example.org/old'
    interval: '10000s'
  }
  'quoted tag': 'https://example.org/new' {
    ua: 'honk/1.0'
    cache: true
  }
}

group {
  hk {
    filter: subtag(short, agent)
    filter: name(keyword: 'HK')
    policy: min_moving_avg
  }
  all {
    filter: subtag(old)
    policy: random
  }
}
`;

describe('readSubscriptionEntries', () => {
  it('reads each tagged form with its options', () => {
    const entries = readSubscriptionEntries(text);
    expect(entries.map(({tag, url, form, options, line}) => ({tag, url, form, options, line}))).toEqual([
      {tag: 'short', url: 'https://example.com/sub', form: 'short', options: [], line: 3},
      {tag: 'agent', url: 'https://example.net/sub', form: 'agent', options: [{name: 'ua', value: 'honk/1.0 like'}], line: 4},
      {tag: 'old', url: 'https://example.org/old', form: 'block', options: [{name: 'interval', value: "'10000s'"}], line: 6},
      {
        tag: 'quoted tag',
        url: 'https://example.org/new',
        form: 'options',
        options: [
          {name: 'ua', value: "'honk/1.0'"},
          {name: 'cache', value: 'true'}
        ],
        line: 10
      }
    ]);
  });

  it('leaves out entries it does not rewrite', () => {
    expect(readSubscriptionEntries(`subscription {\n  a: 'x' b: 'y'\n  c: https://example.org\n}\n`)).toEqual([]);
  });
});

describe('writeSubscriptionEntry', () => {
  const edit = (tag: string, next: {tag: string; url: string}) => writeSubscriptionEntry(text, tag, next);

  it('changes the URL of each form and nothing else', () => {
    expect(edit('short', {tag: 'short', url: 'https://example.com/v2'})).toBe(
      text.replace("short: 'https://example.com/sub' # keep me", "short: 'https://example.com/v2' # keep me")
    );
    expect(edit('agent', {tag: 'agent', url: 'https://example.net/v2'})).toBe(text.replace("'https://example.net/sub'(", "'https://example.net/v2'("));
    expect(edit('old', {tag: 'old', url: 'https://example.org/v2'})).toBe(text.replace("url: 'https://example.org/old'", "url: 'https://example.org/v2'"));
    expect(edit('quoted tag', {tag: 'quoted tag', url: 'https://example.org/v2'})).toBe(
      text.replace("'https://example.org/new' {", "'https://example.org/v2' {")
    );
  });

  it('renames, keeping the form, the options and quotes where the tag had them', () => {
    expect(edit('agent', {tag: 'agent2', url: 'https://example.net/sub'})).toBe(text.replace('  agent:', '  agent2:'));
    expect(edit('old', {tag: 'fresh', url: 'https://example.org/x'})).toBe(
      text.replace('  old: {\n    url: \'https://example.org/old\'', "  fresh: {\n    url: 'https://example.org/x'")
    );
    expect(edit('quoted tag', {tag: 'plain', url: 'https://example.org/new'})).toBe(text.replace("'quoted tag':", "'plain':"));
    expect(edit('short', {tag: 'two words', url: 'https://example.com/sub'})).toBe(text.replace('  short:', "  'two words':"));
  });

  it('writes nothing when neither changes', () => {
    expect(edit('old', {tag: 'old', url: 'https://example.org/old'})).toBe(text);
  });

  it('refuses a tag another subscription uses, and an entry that is gone', () => {
    expect(() => edit('short', {tag: 'old', url: 'https://example.com/sub'})).toThrow(LocalError);
    expect(() => edit('missing', {tag: 'missing', url: 'https://example.com/sub'})).toThrow(LocalError);
  });

  it('finds and updates the groups whose subtag filter names a renamed tag', () => {
    const renamed = edit('short', {tag: 'fast', url: 'https://example.com/sub'});
    const citing = readGroupEntries(renamed).filter(group => classifyFilters(group).subtags.includes('short'));
    expect(citing.map(group => group.name)).toEqual(['hk']);
    const updated = citing.reduce((out, group) => removeSubtagsFromGroup(addSubtagsToGroup(out, group.name, ['fast']), group.name, ['short']), renamed);
    expect(updated).toBe(renamed.replace('filter: subtag(short, agent)', 'filter: subtag(agent, fast)'));
    // A group whose only filter names the old tag keeps a filter rather than widening to every node.
    const alone = edit('old', {tag: 'older', url: 'https://example.org/old'});
    expect(removeSubtagsFromGroup(addSubtagsToGroup(alone, 'all', ['older']), 'all', ['old'])).toBe(
      alone.replace('filter: subtag(old)', 'filter: subtag(older)')
    );
  });
});
