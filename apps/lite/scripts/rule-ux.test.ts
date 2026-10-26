import {describe, expect, it} from 'vitest';
import {addDraftRule, editDraftRule, moveRule, parseRuleList, stageAuthoredRules} from '../src/ruleDraft';
import {ruleReview, dnsReview} from '../src/ruleReview';
import {catalogs} from '../src/i18n';

const source =
  'routing {\r\n  # keep this comment\r\n  domain(suffix: example.org)  ->  proxy # keep spacing\r\n  dip(geoip: private) -> direct\r\n  fallback: proxy\r\n}\r\n';
describe('rule placement and preservation', () => {
  it('places a new rule first without rewriting existing bytes', () => {
    const next = addDraftRule(source, 'routing', 'domain(suffix: example.com)', 'direct', 'first');
    const rows = parseRuleList(next, 'routing').rows;
    expect(rows[0].expression).toBe('domain(suffix: example.com)');
    expect(next.replace(rows[0].raw, '')).toBe(source);
    expect(rows[1].note).toBe('keep this comment');
  });
  it('keeps last insertion before the fallback and moves the complete commented rule', () => {
    const next = addDraftRule(source, 'routing', 'domain(suffix: example.com)', 'direct', 'last');
    const rows = parseRuleList(next, 'routing').rows;
    expect(rows.at(-2)?.expression).toBe('domain(suffix: example.com)');
    const moved = moveRule(next, 'routing', 2, 0);
    expect(parseRuleList(moved, 'routing').rows[1].raw).toBe(rows[0].raw);
    expect(moveRule(moved, 'routing', 0, 2)).toBe(next);
  });
  it('saving an unchanged form remains byte-identical', () => {
    const row = parseRuleList(source, 'routing').rows[0];
    expect(editDraftRule(source, row, row.conditions!, row.target)).toBe(source);
  });
});
describe('plain-language review', () => {
  it('names the added rule and target in every locale', () => {
    const next = addDraftRule(source, 'routing', 'domain(suffix: example.com)', 'direct', 'first');
    for (const t of Object.values(catalogs)) {
      const summary = ruleReview(source, next, 'routing', t).join('\n');
      expect(summary).toContain('example.com');
      expect(summary).not.toMatch(/domain\(|->|suffix:|\(must\)/);
    }
  });
  it('summarizes server address changes without claiming rule changes', () => {
    const before = "dns {\n upstream {\n  test: 'tls://1.1.1.1'\n }\n}\n";
    expect(dnsReview(before, before.replace('1.1.1.1', '9.9.9.9'), catalogs.en)).toEqual(['Change DNS server test to tls://9.9.9.9.']);
  });
});

it('preserves a hand-spaced global mode line when editing another rule', () => {
  const marker = '  l4proto( tcp, udp )  -> proxy   # doona: outbound mode\r\n';
  const before = source.replace('routing {\r\n', 'routing {\r\n' + marker);
  expect(stageAuthoredRules(before, source)).toBe(before);
  const after = addDraftRule(source, 'routing', 'domain(suffix: example.com)', 'direct', 'first');
  const staged = stageAuthoredRules(before, after);
  expect(staged).toContain(marker);
  expect(staged.replace(marker, '')).toBe(after);
});

it('stages edits ahead of mandatory rules for review without rewriting existing bytes', () => {
  const marker = '  l4proto(tcp, udp) -> proxy # doona: outbound mode\n';
  const authored = 'routing {\n  pname(daemon) -> direct(must)\n  fallback: proxy\n}\n';
  const before = authored.replace('  fallback:', marker + '  fallback:');
  const after = addDraftRule(authored, 'routing', 'domain(suffix: example.com)', 'direct', 'first');
  expect(stageAuthoredRules(before, after).replace(marker, '')).toBe(after);
});
