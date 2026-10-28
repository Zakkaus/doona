import {describe, expect, it} from 'vitest';
import {configMain} from '../../../mock/fixtures/configuration';
import {addDraftRule, editDraftRule, moveRule, parseRuleList, serializeBuilder, setFallback, writeRuleList} from '../src/ruleDraft';
import {conditionValues} from '../../../src/dae/groupConditions';
import {scanConfig} from '../../../src/dae/text';

for (const kind of ['routing', 'request', 'response'] as const) {
  it(`round trips the mock ${kind} list byte for byte`, () => {
    const doc = parseRuleList(configMain, kind);
    expect(doc.rows.length).toBeGreaterThan(0);
    expect(writeRuleList(doc)).toBe(configMain);
    for (const row of doc.rows.filter(row => row.conditions)) expect(editDraftRule(configMain, row, row.conditions!, row.target)).toBe(configMain);
    expect(moveRule(moveRule(configMain, kind, 0, 1), kind, 1, 0)).toBe(configMain);
  });
}
describe('lossless draft boundaries', () => {
  const text =
    '# before\r\nrouting {\r\n  # first note\r\n  domain( suffix: example.net )  ->  direct # trailing\r\n\r\n  # second note\r\n  future(opaque || syntax) -> block\r\n  fallback: direct\r\n  # end\r\n}\r\n# after\r\n';
  it('preserves custom rows, CRLF, comments and spacing', () => {
    const doc = parseRuleList(text, 'routing');
    expect(writeRuleList(doc)).toBe(text);
    expect(doc.rows[1].conditions).toBeNull();
    expect(doc.rows[0].note).toBe('first note');
    const moved = moveRule(text, 'routing', 1, 0);
    expect(moved.indexOf('# second note')).toBeLessThan(moved.indexOf('# first note'));
    expect(moveRule(moved, 'routing', 0, 1)).toBe(text);
    expect(editDraftRule(text, doc.rows[0], doc.rows[0].conditions!, 'block')).toContain('domain( suffix: example.net )  -> block # trailing');
  });
  it('adds before fallback and changes only the fallback target', () => {
    const added = addDraftRule(text, 'routing', 'dport(443) && l4proto(udp)', 'block');
    expect(added.indexOf('dport(443)')).toBeLessThan(added.indexOf('fallback:'));
    expect(setFallback(text, 'routing', 'block')).toBe(text.replace('fallback: direct', 'fallback: block'));
  });
  it('adds rules and a fallback to an inline block without merging statements', () => {
    const original = "routing { domain(suffix: 'one.example') -> direct }\n";
    const added = addDraftRule(original, 'routing', "domain(suffix: 'two.example')", 'block');
    expect(parseRuleList(added, 'routing').rows.map(row => row.target)).toEqual(['direct', 'block']);
    const fallback = parseRuleList(setFallback(original, 'routing', 'block'), 'routing').rows;
    expect(fallback.map(row => [row.target, row.fallback])).toEqual([
      ['direct', false],
      ['block', true]
    ]);
  });
  it('keeps multiline conditions opaque without losing their bytes', () => {
    const multiline = 'routing {\n # keep\n domain(\n  suffix: example.net,\n  suffix: example.org\n ) -> direct # tail\n fallback: direct\n}\n';
    const doc = parseRuleList(multiline, 'routing');
    expect(doc.rows).toHaveLength(2);
    expect(writeRuleList(doc)).toBe(multiline);
  });
  it('creates a missing DNS list without changing upstreams', () => {
    const original = "dns {\n upstream {\n  one: 'udp://1.1.1.1:53'\n }\n}\n";
    const next = addDraftRule(original, 'request', 'qtype(A)', 'one');
    expect(next).toContain("one: 'udp://1.1.1.1:53'");
    expect(parseRuleList(next, 'request').rows[0].target).toBe('one');
    expect(scanConfig(next).blocks[0].close).toBeLessThan(next.length);
  });
  it('refuses ambiguous parent blocks and keeps unknown text untouched', () => {
    const text = 'dns {\n routing {\n }\n routing {\n }\n}\n';
    const doc = parseRuleList(text, 'request');
    expect(doc.ambiguous).toBe(true);
    expect(writeRuleList(doc)).toBe(text);
    const duplicate = 'routing {\n fallback: direct\n fallback: block\n}\n';
    expect(parseRuleList(duplicate, 'routing').ambiguous).toBe(true);
    expect(writeRuleList(parseRuleList(duplicate, 'routing'))).toBe(duplicate);
  });
  it('serializes extended conditions without allowing statement injection', () => {
    expect(serializeBuilder([{kind: 'domainRegex', value: '^example\\.net$', negate: true}])).toBe("!domain(regex: '^example\\.net$')");
    const regex = serializeBuilder([{kind: 'domainRegex', value: conditionValues(['^a{1,3}\\.net$']), negate: false}])!;
    expect(regex).toBe("domain(regex: '^a{1,3}\\.net$')");
    const text = `routing {\n ${regex} -> direct\n}\n`;
    const row = parseRuleList(text, 'routing').rows[0];
    expect(row.conditions).not.toBeNull();
    expect(editDraftRule(text, row, row.conditions!, row.target)).toBe(text);
    expect(serializeBuilder([{kind: 'dport', value: '443) -> direct #', negate: false}])).toBeNull();
  });
});
