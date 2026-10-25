import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {assignStages, cataloguePart, scanModules, stages} from './catalogue-parts.mjs';

const module = (keys, edges = []) => ({keys: new Set(keys), edges, unresolved: []});

it('assigns each key to the first stage whose code names it', () => {
  const modules = new Map([
    [
      'src/main.tsx',
      module(
        ['a.entry', 'a.shared'],
        [
          {to: 'src/Lazy.tsx', stage: null},
          {to: 'src/Frame.tsx', stage: 'activity'}
        ]
      )
    ],
    // An import without a stage, dynamic or not, belongs to the code that makes it.
    ['src/Lazy.tsx', module(['a.lazy'])],
    ['src/Frame.tsx', module(['a.shared', 'a.frame'], [{to: 'src/Page.tsx', stage: 'rest'}])],
    ['src/Page.tsx', module(['a.page'])]
  ]);
  const keys = new Set(['a.entry', 'a.shared', 'a.lazy', 'a.frame', 'a.page', 'a.unused']);
  expect(Object.fromEntries(assignStages(modules, keys))).toEqual({
    'a.entry': 'core',
    'a.shared': 'core',
    'a.lazy': 'core',
    'a.frame': 'activity',
    'a.page': 'rest',
    'a.unused': 'rest'
  });
});

it('reads the stage from a catalogue part id', () => {
  expect(cataloguePart('/x/src/i18n/locales/zh-TW.json?part=activity')).toEqual({lang: 'zh-TW', stage: 'activity'});
  expect(cataloguePart('/x/src/i18n/locales/en.json?part=core&lang.json')).toEqual({lang: 'en', stage: 'core'});
  expect(cataloguePart('/x/src/i18n/locales/en.json')).toBeNull();
});

// Every message a stage's code can show is in that stage's part or an earlier one, since a stage's part holds every key
// its code reaches that no earlier stage holds. That holds only while the scan sees the whole import graph.
it('sees every import of the application and every stage boundary', () => {
  const keys = new Set(Object.keys(JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8'))));
  const modules = scanModules('.', keys);
  expect([...modules].filter(([, {unresolved}]) => unresolved.length).map(([path, {unresolved}]) => `${path}: ${unresolved.join(', ')}`)).toEqual([]);
  const boundaries = [...modules].flatMap(([path, {edges}]) => edges.filter(edge => edge.stage).map(edge => `${edge.stage} ${edge.to} (${path})`));
  // The signed-in frame and the Activity page start the activity stage; every other page and search start the last.
  expect(boundaries.filter(line => line.startsWith('activity '))).toEqual(
    ['activity src/shell/widgets/Dashboard.tsx (src/shell/registry.ts)', 'activity src/shell/Frame.tsx (src/shell/Shell.tsx)'].sort(
      (a, b) => boundaries.indexOf(a) - boundaries.indexOf(b)
    )
  );
  const pages = readFileSync('src/shell/registry.ts', 'utf8').match(/import\('\.\.\/features\/[^']+'\)/g);
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) expect(boundaries.some(line => line.startsWith(`rest src/features/${page.slice(20, -2)}.tsx `))).toBe(true);
  expect(stages.at(-1)).toBe('rest');
});

it('maps every template-built translation family and loads DNS outcomes with Activity in every locale', () => {
  for (const lang of ['en', 'zh-CN', 'zh-TW']) {
    const keys = new Set(Object.keys(JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'))));
    const modules = scanModules('.', keys);
    const assigned = assignStages(modules, keys);
    const outcomes = [...keys].filter(key => key.startsWith('dns.outcome.'));
    expect(outcomes).toHaveLength(4);
    for (const key of outcomes) expect(assigned.get(key), key).toBe('activity');
  }
  // Scans every module once per locale, which takes longer than the default 5 s on CI runners.
}, 60_000);
