import {expect, it} from 'vitest';
import {engineOf} from '../../api/engines';
import {version} from '../../api/mock/fixtures';
import {locatedForms, sameFormValues, sourceForms} from './sourceForms';
const engine = engineOf(version);
it.each([1, 2, 3, 4, 5, 6, null])('selects form links by their line interval at %s', focus => {
  const text = 'global {\n log_level: info\n}\nrouting {\n fallback: direct\n}';
  const links = sourceForms(text, 'main', engine);
  const selected = locatedForms(links, focus, text);
  expect(selected.map(link => link.label)).toEqual(focus === 2 ? ['log_level'] : focus !== null && focus >= 4 ? ['routing'] : []);
});
it('routes located globals to their sole form and protects them from raw changes', () => {
  const before = "global {\n log_level: info\n unknown: 'keep'\n}\ndns { bind: '127.0.0.1:53' }";
  const [link] = sourceForms(before, 'include', engine);
  expect(link.href).toBe('#/settings?card=global&source=include&section=0&field=log_level');
  expect(link.line).toBe(2);
  expect(sameFormValues(before, before.replace('info', 'debug'), 'include', engine)).toBe(false);
  expect(sameFormValues(before, before.replace('keep', 'other'), 'include', engine)).toBe(true);
  expect(sameFormValues(before, before.replace(':53', ':54'), 'include', engine)).toBe(true);
  expect(sameFormValues(before, before + '\n# comment', 'include', engine)).toBe(true);
  expect(sameFormValues(before, before + '\nrouting { include rules.dae }', 'include', engine)).toBe(true);
  expect(sameFormValues(before, before + '\nglobal { mptcp: true }', 'include', engine)).toBe(false);
});

it('allows duplicate repair and comments while protecting other occurrences', () => {
  const before = 'global { log_level: info\n log_level: warn }\nglobal { log_level: error }\nrouting { fallback: direct }';
  expect(sameFormValues(before, before.replace('log_level: warn', ''), 'main', engine)).toBe(true);
  expect(sameFormValues(before, before.replace('log_level: error', 'log_level: debug'), 'main', engine)).toBe(false);
  expect(sameFormValues(before, before.replace('fallback:', '# comment\n fallback:'), 'main', engine)).toBe(true);
});

it('keeps raw access to fields without a form and links subscriptions to their editor', () => {
  const before =
    "node { n: 'socks5://localhost:1080' }\nsubscription {\n sub: 'https://example.com' {\n cache: true\n unknown: foo\n }\n}\ngroup { p {\n policy: fixed(0)\n unknown: foo\n} }";
  expect(sourceForms(before, 'main', engine).find(link => link.label === 'sub')?.href).toBe('#/nodes?editSubscription=sub');
  expect(sameFormValues(before, before.replace('1080', '1081'), 'main', engine)).toBe(true);
  expect(sameFormValues(before, before.replaceAll('unknown: foo', 'unknown: bar'), 'main', engine)).toBe(true);
  expect(sameFormValues(before, before.replace('cache: true', 'cache: false'), 'main', engine)).toBe(false);
  expect(sameFormValues(before, before.replace('policy: fixed(0)', 'policy: min'), 'main', engine)).toBe(false);
});

it('protects rule targets while keeping conditions and include paths editable until their forms cover them', () => {
  const before = 'routing {\n domain(example.org) -> direct\n include rules.dae\n fallback: direct\n}';
  expect(sameFormValues(before, before.replace('example.org', 'example.net'), 'main', engine)).toBe(true);
  expect(sameFormValues(before, before.replace('rules.dae', 'other.dae'), 'main', engine)).toBe(true);
  expect(sameFormValues(before, before.replace('-> direct', '-> block'), 'main', engine)).toBe(false);
  expect(sameFormValues(before, before.replace('fallback: direct', 'fallback: block'), 'main', engine)).toBe(false);
});

it('protects targets in bare routing includes and leaves subscription includes without a form editable', () => {
  const rules = 'domain(example.org) -> direct\n';
  expect(sameFormValues(rules, rules.replace('direct', 'block'), 'include', engine, 'include')).toBe(false);
  expect(sameFormValues(rules, rules.replace('example.org', 'example.net'), 'include', engine, 'include')).toBe(true);
  const subscriptions = "subscription { sub: 'https://example.org' }";
  expect(sourceForms(subscriptions, 'include', engine, 'include')).toEqual([]);
  expect(sameFormValues(subscriptions, subscriptions.replace('example.org', 'example.net'), 'include', engine, 'include')).toBe(true);
});

it.each(['routing { fallback: direct }', 'dns { routing { request { fallback: direct } } }', 'routing { domain(example.org) -> direct }'])(
  'allows formatting %s while protecting the target',
  before => {
    expect(sameFormValues(before, before.replaceAll(' }', '\n}'), 'main', engine)).toBe(true);
    expect(sameFormValues(before, before.replace('direct', 'block'), 'main', engine)).toBe(false);
  }
);
it('compares a large routing file without quadratic stalls', () => {
  const before = 'routing {\n' + 'domain(example.org) -> direct\n'.repeat(60000) + '}';
  const start = performance.now();
  expect(sameFormValues(before, before + '\n# comment', 'main', engine)).toBe(true);
  expect(performance.now() - start).toBeLessThan(2000);
});
