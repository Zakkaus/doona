import {readdirSync, readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
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

// A token a palette block leaves out does not fail anywhere: it silently inherits Rosé Pine's `:root` default, so a
// palette can ship with one stray colour. These read each family's stylesheet and check the CONTRIBUTING.md token table.
const required = [
  ...['base', 'surface', 'overlay', 'text', 'subtle', 'muted', 'pine', 'foam', 'iris', 'gold', 'rose', 'love'],
  ...Array.from({length: 8}, (_, i) => `c${i + 1}`),
  ...['hl-low', 'hl-med', 'hl-high', 'shadow']
].map(name => `--rp-${name}`);

// Tokens a block is known to leave out, as `selector: token`. Empty: every block sets the whole table.
const exceptions = new Set();

// Every token a selector receives. A plain regex over `selector {body}` is enough for these files: it also sees rules
// nested in @media, and a selector repeated in several blocks (qiangguo) or listed with others (`a, b {}`) adds up.
function declared(css) {
  const bySelector = new Map();
  for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tokens = [...body.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]);
    for (const selector of selectors.split(',').map(part => part.trim())) {
      const known = bySelector.get(selector) ?? new Set();
      tokens.forEach(token => known.add(token));
      bySelector.set(selector, known);
    }
  }
  return bySelector;
}

// Glass is written like the others, its light block after the dark one; its materials live in ../glass.css. Clear takes
// Glass's tokens as the family sets them, so it has no blocks of its own.
const inherits = new Set(['glass/clear']);
describe.each(families)('%s palette', family => {
  const blocks = declared(readFileSync(new URL(`palettes/${family}.css`, styles), 'utf8'));
  const flavours = palettes
    .map(palette => palette.id.split('/'))
    .filter(([f, flavour]) => f === family && flavour !== family && !inherits.has(`${f}/${flavour}`));
  const selectors = [
    `:root[data-family='${family}']`,
    `:root[data-family='${family}'][data-scheme='dark']`,
    ...flavours.map(([, flavour]) => `:root[data-flavour='${flavour}'][data-scheme='dark']`)
  ];
  it.each(selectors)('%s sets every token in the table', selector => {
    const known = blocks.get(selector);
    expect(known, `no block for ${selector}`).toBeDefined();
    expect(required.filter(token => !known.has(token) && !exceptions.has(`${selector}: ${token}`))).toEqual([]);
  });
});
