import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {marker, parse, render, summarize} from './size-report.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`size-report-fixture/${name}.json`, import.meta.url), 'utf8'));
const current = parse(fixture('pr'));
const main = parse(fixture('main'));

it('renders a pull request against main with the parts of every budget that grew', () => {
  expect(render(current, main)).toBe(
    [
      '❌ **Size report** 1a2b3c4d vs `main` 568f266c: 1 over limit (route)',
      '',
      'Gzip bytes each budget counts; a limit is a fixed ceiling in `sizeBudget` in `package.json`.',
      '',
      '| | This PR | `main` | Change | Limit |',
      '|---|---|---|---|---|',
      '| `startupLogin` (`login`) | 216.5 KB | 216.1 KB | +420 B | 227.0 KB |',
      '| `startupCss` (`activity`) | 31.5 KB | 31.6 KB | −52 B | 34.0 KB |',
      '| ❌ `route` (`src/features/rules/Rules.tsx`) | 76.2 KB | 71.9 KB | +4285 B | 76.0 KB |',
      '',
      '<details><summary>Largest parts of the 2 budgets that grew</summary>',
      '',
      '**startupLogin** (+420 B)',
      '',
      '| Part | This PR | Change |',
      '|---|---|---|',
      '| `assets/index-*.js` | 150.4 KB | +400 B |',
      '| `assets/Login-*.js` | 40.0 KB | +20 B |',
      '| `assets/locale-zh-CN-*.js` | 26.1 KB | 0 B |',
      '',
      '**route** (+4285 B)',
      '',
      '| Part | This PR | Change |',
      '|---|---|---|',
      '| `assets/Rules-*.js` | 52.0 KB | +2000 B |',
      '| `assets/table-*.js` | 21.9 KB | 0 B |',
      '| `assets/trace-*.js` | 2.3 KB | new |',
      '',
      '</details>',
      '',
      'Everything built, for information: JS 905.0 KB, CSS 40.0 KB.',
      marker,
      ''
    ].join('\n')
  );
});

it('says when main has no measurement for the base commit or none at all', () => {
  const older = {...main, commit: 'f'.repeat(40)};
  expect(render(current, older).split('\n')[0]).toBe(
    '❌ **Size report** 1a2b3c4d vs the newest `main` measurement ffffffff, none for the base 568f266c: 1 over limit (route)'
  );
  const report = render(current, null);
  expect(report.split('\n')[0]).toBe('❌ **Size report** 1a2b3c4d with no `main` measurement to compare: 1 over limit (route)');
  expect(report).toContain('| `startupLogin` (`login`) | 216.5 KB | — | — | 227.0 KB |');
  expect(report).not.toContain('<details>');
});

it('passes when every budget is within its limit', () => {
  const within = {...current, budgets: current.budgets.map(budget => ({...budget, limit: 1_000_000}))};
  expect(render(within, main).split('\n')[0]).toBe('✅ **Size report** 1a2b3c4d vs `main` 568f266c: no limits exceeded');
  expect(render(within, main)).not.toContain('❌');
});

it('prints names from a fork only as plain code spans', () => {
  const hostile = fixture('pr');
  hostile.budgets[0].label = 'login` | <img src=x onerror=alert(1)>\n## heading';
  hostile.budgets[0].parts[0].file = '`](https://example.com)';
  hostile.budgets.push({name: 'evil`name', limit: 1, bytes: 2, label: '', parts: []});
  const report = render(parse(hostile), main);
  expect(report).toContain('| `startupLogin` (`login  img src=x onerror=alert(1) heading`) |');
  expect(report).toContain('| `(https//example.com)` | 150.4 KB | new |');
  expect(report).not.toMatch(/evil|<img|\n## /);
});

it('treats a malformed measurement as missing', () => {
  expect(parse({schema: 2, budgets: []})).toBeNull();
  expect(parse(null)).toBeNull();
  const broken = parse({schema: 1, commit: 'not a sha', budgets: [{name: 'route', limit: -1, bytes: 1.5, label: 7, parts: [{file: 'a.js', bytes: 'x'}]}]});
  expect(broken).toEqual({commit: null, base: null, budgets: [{name: 'route', limit: null, bytes: null, label: '', parts: []}], total: {js: null, css: null}});
  expect(render(broken, null)).toContain('| ❌ `route` (`?`) | — | — | — | — |');
  expect(render(null, main)).toBe(`❌ **Size report**: the measurement is missing or unreadable.\n${marker}\n`);
});

it('rejects a measurement with too many budgets or parts', () => {
  const budget = parts => ({name: 'route', limit: 1, bytes: 1, label: '', parts});
  const part = {file: 'a.js', bytes: 1};
  expect(parse({schema: 1, budgets: Array.from({length: 50}, () => budget([]))})).not.toBeNull();
  expect(parse({schema: 1, budgets: Array.from({length: 51}, () => budget([]))})).toBeNull();
  expect(parse({schema: 1, budgets: [budget(Array.from({length: 200}, () => part))]})).not.toBeNull();
  expect(parse({schema: 1, budgets: [budget(Array.from({length: 201}, () => part))]})).toBeNull();
});

it('writes each budget with its worst entry, its largest parts and the commits measured', () => {
  const worst = {bytes: 30, label: 'login', parts: Array.from({length: 25}, (_, index) => [`assets/${index}.js`, 25 - index])};
  const written = summarize([{name: 'startupLogin', limit: 40, ok: true, worst}], {js: 30, css: 0}, {commit: 'a'.repeat(40), base: ''});
  expect(written).toMatchObject({schema: 1, commit: 'a'.repeat(40), base: null, total: {js: 30, css: 0}});
  expect(written.budgets[0]).toMatchObject({name: 'startupLogin', limit: 40, bytes: 30, label: 'login'});
  expect(written.budgets[0].parts).toHaveLength(20);
  expect(written.budgets[0].parts[0]).toEqual({file: 'assets/0.js', bytes: 25});
  expect(parse(JSON.parse(JSON.stringify(written))).budgets[0].parts).toHaveLength(20);
});
