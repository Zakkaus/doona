import {expect, it} from 'vitest';
import {breakpoints, panelQuery, phoneQuery, sidebarQuery, smallQuery} from './hooks';

const allowed = new Set(Object.values(breakpoints).flatMap(width => [`(min-width: ${width}px)`, `(max-width: ${width - 0.02}px)`]));
// Inclusive bounds left as they are: the `.98` form would change the layout at that one width, so each waits for the
// maintainer to see it.
const inclusive = ['charts.css (max-width: 640px)', 'fields.css (max-width: 480px)', 'shell-search.css (max-width: 420px)'];

it('writes every width in a media query as a named breakpoint', () => {
  const files = import.meta.glob<string>('/src/**/*.css', {query: '?raw', import: 'default', eager: true});
  const off = Object.entries(files).flatMap(([path, css]) =>
    [...css.matchAll(/@media([^{]*)\{/g)]
      .flatMap(([, prelude]) => prelude.match(/\([^()]*width[^()]*\)/g) ?? [])
      .filter(query => !allowed.has(query))
      .map(query => `${path.split('/').pop()} ${query}`)
  );
  expect(off.sort()).toEqual(inclusive);
});

it('keeps the media queries in components on the same list', () => {
  expect([phoneQuery, smallQuery, sidebarQuery, panelQuery].filter(query => !allowed.has(query))).toEqual([]);
  const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.*', '!/src/ui/hooks.ts'], {query: '?raw', import: 'default', eager: true});
  expect(Object.keys(sources).filter(path => /['"`]\((?:(?:min|max)-width|width\s*[<>])/.test(sources[path]))).toEqual([]);
});
