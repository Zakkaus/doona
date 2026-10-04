import {expect, it} from 'vitest';
import {budgetNames, checkLimits, closure, evaluate, measure, report, totals} from './size-budget.mjs';

const chunk = (file, extra = {}) => ({file: `assets/${file}`, ...extra});
const manifest = {
  'index.html': chunk('entry.js', {isEntry: true, imports: ['_vendor.js'], css: ['assets/entry.css'], dynamicImports: ['src/shell/Login.tsx']}),
  '_vendor.js': chunk('vendor.js'),
  '_shared.js': chunk('shared.js', {imports: ['_vendor.js']}),
  '_activity.js': chunk('activity.js', {name: 'activity', isDynamicEntry: true, imports: ['_vendor.js', '_shared.js'], css: ['assets/activity.css']}),
  '_activity.css': chunk('activity.css'),
  'src/shell/Login.tsx': chunk('login.js', {isDynamicEntry: true, imports: ['_vendor.js', '_loginOnly.js']}),
  '_loginOnly.js': chunk('loginOnly.js'),
  'src/ui/charts/Donut.tsx': chunk('donut.js', {isDynamicEntry: true, imports: ['_vendor.js']}),
  'src/ui/charts/AreaChart.tsx': chunk('area.js', {isDynamicEntry: true, imports: ['_chartMath.js']}),
  '_chartMath.js': chunk('chartMath.js'),
  'src/ui/charts/Sparkline.tsx': chunk('spark.js', {isDynamicEntry: true, imports: ['_chartMath.js']}),
  'src/features/rules/Rules.tsx': chunk('rules.js', {isDynamicEntry: true, imports: ['_vendor.js', '_shared.js', '_table.js'], css: ['assets/rules.css']}),
  '_table.js': chunk('table.js'),
  'src/features/config/Config.tsx': chunk('config.js', {isDynamicEntry: true, imports: ['_vendor.js', '_editor.js']}),
  '_editor.js': chunk('editor.js'),
  'src/i18n/locales/en.json': chunk('locale-en.js', {src: 'src/i18n/locales/en.json', isDynamicEntry: true}),
  'src/i18n/locales/zh-TW.json': chunk('locale-zh-TW.js', {src: 'src/i18n/locales/zh-TW.json', isDynamicEntry: true}),
  'src/fonts-sc.css': chunk('fonts-sc.css', {src: 'src/fonts-sc.css'}),
  'mock/index.ts': chunk('mock.js', {isDynamicEntry: true, imports: ['_vendor.js', '_shared.js', '_mockData.js']}),
  '_mockData.js': chunk('mockData.js')
};
const bytes = {
  'entry.js': 100,
  'vendor.js': 1000,
  'shared.js': 10,
  'activity.js': 200,
  'login.js': 20,
  'loginOnly.js': 30,
  'donut.js': 50,
  'area.js': 60,
  'chartMath.js': 70,
  'spark.js': 80,
  'rules.js': 300,
  'table.js': 400,
  'config.js': 500,
  'editor.js': 600,
  'locale-en.js': 7,
  'locale-zh-TW.js': 9,
  'mock.js': 1100,
  'mockData.js': 1200,
  'entry.css': 3,
  'activity.css': 4,
  'rules.css': 5,
  'fonts-sc.css': 6
};
const size = file => bytes[file.replace('assets/', '')] ?? expect.unreachable(`unknown file ${file}`);
const measured = (budget, label) => measure(manifest, size).find(item => item.budget === budget && (!label || item.label === label));
const limits = Object.fromEntries(budgetNames.map(name => [name, 1_000_000]));

it.each([
  ['follows static imports only', 'index.html', ['index.html', '_vendor.js']],
  ['visits a shared chunk once', 'src/features/rules/Rules.tsx', ['src/features/rules/Rules.tsx', '_vendor.js', '_shared.js', '_table.js']],
  ['does not follow dynamic imports', 'src/shell/Login.tsx', ['src/shell/Login.tsx', '_vendor.js', '_loginOnly.js']]
])('closure %s', (_name, key, expected) => {
  expect([...closure(manifest, key)].sort()).toEqual([...expected].sort());
});

it('closure survives import cycles and names a missing chunk', () => {
  const cyclic = {a: {file: 'a.js', imports: ['b']}, b: {file: 'b.js', imports: ['a']}};
  expect([...closure(cyclic, 'a')]).toEqual(['a', 'b']);
  expect(() => closure({a: {file: 'a.js', imports: ['gone']}}, 'a')).toThrow('Missing manifest chunk: gone');
});

// Shell is entry plus vendor (1100); the larger locale (9) counts, the smaller does not.
it.each([
  ['startupLogin', 'login', 1100 + 9 + 20 + 30],
  ['startupActivity', 'activity', 1100 + 9 + 200 + 10 + 50 + 60 + 70 + 80],
  ['startupCss', 'activity', 3 + 4],
  ['mock', 'mock/index.ts', 1100 + 1200],
  ['route', 'src/features/rules/Rules.tsx', 300 + 400],
  ['routeConfig', 'src/features/config/Config.tsx', 500 + 600],
  ['fontCss', 'src/fonts-sc.css', 6],
  ['locale', 'src/i18n/locales/zh-TW.json', 9]
])('measures %s as the bytes a user downloads', (budget, label, expected) => {
  const item = measured(budget, label);
  expect(item.bytes).toBe(expected);
  expect(item.parts.reduce((sum, [, part]) => sum + part, 0)).toBe(expected);
});

it('route and mock count only what startup does not already load', () => {
  const files = name => measured(name.budget, name.label).parts.map(([file]) => file);
  expect(files({budget: 'route', label: 'src/features/rules/Rules.tsx'})).toEqual(['assets/table.js', 'assets/rules.js']);
  expect(files({budget: 'mock', label: 'mock/index.ts'})).toEqual(['assets/mockData.js', 'assets/mock.js']);
});

it('reports a manifest without the expected layout instead of passing', () => {
  const {'src/features/config/Config.tsx': _config, ...withoutConfig} = manifest;
  expect(() => measure(withoutConfig, size)).toThrow('Manifest has no src/features/config/Config.tsx');
  const {'index.html': _entry, ...withoutEntry} = manifest;
  expect(() => measure(withoutEntry, size)).toThrow('Manifest has no entry chunk');
});

it('fails a budget with its name, size, limit and largest contributors', () => {
  const results = evaluate(measure(manifest, size), {...limits, startupLogin: 1158, route: 700});
  expect(results.filter(({ok}) => !ok).map(({name}) => name)).toEqual(['startupLogin']);
  const failing = results.find(({name}) => name === 'startupLogin');
  expect(report(failing, 2)).toBe(
    [
      'FAIL startupLogin: 1159 bytes gzip / 1158 limit (login), over by 1',
      '  largest contributors:',
      '    assets/vendor.js: 1000 bytes gzip',
      '    assets/entry.js: 100 bytes gzip'
    ].join('\n')
  );
});

it('names the worst entry when one of several routes is over', () => {
  const results = evaluate(measure(manifest, size), {...limits, route: 699});
  const failing = results.find(({ok}) => !ok);
  expect(failing.name).toBe('route');
  expect(report(failing)).toContain('FAIL route: 700 bytes gzip / 699 limit (src/features/rules/Rules.tsx), over by 1');
  expect(report(failing)).toContain('assets/table.js: 400 bytes gzip');
});

it('passes every budget at its limit', () => {
  const exact = Object.fromEntries(evaluate(measure(manifest, size), limits).map(({name, worst}) => [name, worst.bytes]));
  expect(evaluate(measure(manifest, size), exact).every(({ok}) => ok)).toBe(true);
});

it.each([
  ['a missing key', {...limits, mock: undefined}, 'Invalid sizeBudget.mock'],
  ['a zero limit', {...limits, route: 0}, 'Invalid sizeBudget.route'],
  ['an unknown key', {...limits, shell: 275000}, 'Unknown sizeBudget keys: shell']
])('rejects %s in sizeBudget', (_name, bad, message) => {
  expect(() => checkLimits(bad)).toThrow(message);
});

it('totals count the largest locale once and never gate', () => {
  const sizes = new Map([
    ['assets/a.js', 10],
    ['assets/locale-en.js', 5],
    ['assets/locale-zh.js', 8],
    ['assets/a.css', 3]
  ]);
  expect(totals(sizes)).toEqual({js: 18, css: 3});
});
