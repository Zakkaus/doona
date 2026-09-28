import {readdirSync, readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {palettes} from '../src/shell/palettes';

const styles = new URL('../src/ui/styles/', import.meta.url);
const families = [...new Set(palettes.map(palette => palette.id.split('/')[0]))].sort();

// A family's images sit beside its stylesheet, so only the stylesheets count.
it('has one stylesheet per palette family and none without a palette', () => {
  const files = readdirSync(new URL('palettes/', styles))
    .filter(file => file.endsWith('.css'))
    .map(file => file.replace(/\.css$/, ''));
  expect(files.sort()).toEqual(families);
});

it('imports every family stylesheet', () => {
  const index = readFileSync(new URL('palettes.css', styles), 'utf8');
  expect([...index.matchAll(/@import '\.\/palettes\/(.+)\.css';/g)].map(match => match[1]).sort()).toEqual(families);
});
