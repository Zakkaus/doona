import {expect, it} from 'vitest';
import {engineOf} from '../../api/engines';
import {version} from '../../../mock/fixtures';
import {locatedForms, sourceForms} from './sourceForms';
const engine = engineOf(version);
it.each([1, 2, 3, 4, 5, 6, null])('selects form links by their line interval at %s', focus => {
  const text = 'global {\n log_level: info\n}\nrouting {\n fallback: direct\n}';
  const links = sourceForms(text, 'main', engine);
  const selected = locatedForms(links, focus, text);
  expect(selected.map(link => link.label)).toEqual(focus === 2 ? ['log_level'] : focus !== null && focus >= 4 ? ['routing'] : []);
});
it('routes located globals to their sole form', () => {
  const before = "global {\n log_level: info\n unknown: 'keep'\n}\ndns { bind: '127.0.0.1:53' }";
  const [link] = sourceForms(before, 'include', engine);
  expect(link.href).toBe('#/config?tab=global&source=include&section=0&field=log_level');
  expect(link.line).toBe(2);
});

it('links subscriptions to their editor only in the main source', () => {
  const before = "subscription {\n sub: 'https://example.com' {\n cache: true\n }\n}";
  expect(sourceForms(before, 'main', engine).find(link => link.label === 'sub')?.href).toBe('#/nodes?editSubscription=sub');
  expect(sourceForms(before, 'include', engine, 'include')).toEqual([]);
});
