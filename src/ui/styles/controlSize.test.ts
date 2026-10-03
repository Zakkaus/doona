import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform, type Selector} from 'lightningcss';
import {expect, it} from 'vitest';
import {ControlSizeContext} from '../controlSize';
import {Segmented} from '../Segmented';
import segmentedCss from './segmented.css?raw';

const owners: Record<string, string> = {
  'rp-btn': 'buttons-menus.css',
  'rp-select': 'dialogs-search.css',
  'rp-input': 'dialogs-search.css',
  'rp-selectbtn': 'fields.css',
  'rp-switch': 'fields.css',
  'rp-seg': 'segmented.css',
  'rp-segpick': 'segmented.css',
  'rp-tab': 'tabs-panels.css',
  'rp-tabbar': 'tabs-panels.css',
  'rp-tablist': 'tabs-panels.css'
};
// The size tokens a control height may use: M and L follow the surrounding context; XS is fixed (a help trigger).
const sizeTokens = /"--rp-control(?:-lg|-xs)?"/;
const dimensions: Record<string, true> = {height: true, 'min-height': true, 'block-size': true, 'min-block-size': true};

function violations(css: string, filename: string): string[] {
  const errors: string[] = [];
  transform({
    filename,
    code: new TextEncoder().encode(css),
    visitor: {
      Rule: {
        style(rule) {
          for (const selector of rule.value.selectors) {
            const lastCombinator = selector.reduce((last, part, index) => (part.type === 'combinator' ? index : last), -1);
            const subject = selector.slice(lastCombinator + 1);
            const classes = (parts: Selector): string[] =>
              parts.flatMap(part =>
                part.type === 'class'
                  ? [part.name]
                  : part.type === 'pseudo-class' && (part.kind === 'is' || part.kind === 'where')
                    ? part.selectors.flatMap(classes)
                    : []
              );
            const names = classes(subject);
            const controls = names.filter(name => name in owners);
            for (const declaration of [...rule.value.declarations.declarations, ...rule.value.declarations.importantDeclarations]) {
              const property = declaration.property === 'unparsed' ? declaration.value.propertyId.property : declaration.property;
              if (!(property in dimensions) || !controls.length) continue;
              const prefix = selector.slice(0, lastCombinator);
              const segmentedButton =
                filename === 'segmented.css' &&
                prefix[0]?.type === 'class' &&
                prefix[0].name === 'rp-seg' &&
                prefix.every(part => (part.type === 'class' && part.name === 'rp-seg') || part.type === 'attribute');
              const tabList =
                filename === 'tabs-panels.css' &&
                prefix[0]?.type === 'class' &&
                prefix[0].name === 'rp-tabbar' &&
                prefix.every(part => (part.type === 'class' && part.name === 'rp-tabbar') || part.type === 'attribute');
              const variants = ['icon', 'sm', 'quiet', 'secondary', 'accent', 'negative', 'rp-help', 'affixed'];
              const own =
                controls.every(control => owners[control] === filename) &&
                names.every(name => name in owners || variants.includes(name)) &&
                (lastCombinator < 0 || tabList);
              if (!own && !segmentedButton) errors.push(`${filename}:${rule.value.loc.line + 1}: sizing outside the component block`);
              const value = JSON.stringify(declaration.value);
              const zero = declaration.property !== 'unparsed' && value.includes('"value":0');
              if (!zero && !sizeTokens.test(value)) errors.push(`${filename}:${rule.value.loc.line + 1}: height must use a control token`);
              if (/"unit":"px","value":(?!0[},])/.test(value)) errors.push(`${filename}:${rule.value.loc.line + 1}: literal control height`);
            }
          }
        }
      }
    }
  });
  return errors;
}

it('keeps control heights token-based in their component blocks', () => {
  const files = import.meta.glob('./*.css', {query: '?raw', import: 'default', eager: true}) as Record<string, string>;
  expect(Object.values(files).every(Boolean)).toBe(true);
  const errors = Object.entries(files).flatMap(([file, css]) => violations(css, file.slice(2)));
  expect(errors).toEqual([]);
});

it('rejects page, one-off and literal control sizing, including logical sizes and important declarations', () => {
  expect(violations('.page .rp-btn {height: var(--rp-control-lg)}', 'buttons-menus.css')).toHaveLength(1);
  expect(violations('.rp-tab {min-block-size: var(--rp-control)}', 'page-layout.css')).toHaveLength(1);
  expect(violations('.page :is(.rp-btn, .rp-input) {height: var(--rp-control)}', 'buttons-menus.css')).toHaveLength(1);
  expect(violations('.rp-btn.one-off {height: var(--rp-control)}', 'buttons-menus.css')).toHaveLength(1);
  expect(violations('.rp-input {height: 40px !important}', 'dialogs-search.css')).toHaveLength(2);
  expect(violations('.rp-btn {block-size: var(--rp-control-lg)}', 'buttons-menus.css')).toEqual([]);
  expect(violations('.rp-btn.icon.rp-help[data-size] {width: var(--rp-control-xs); height: var(--rp-control-xs)}', 'buttons-menus.css')).toEqual([]);
  expect(violations('.rp-btn.icon.rp-help {height: 24px}', 'buttons-menus.css')).toHaveLength(2);
  expect(violations('.rp-btn > svg {height: 16px}', 'buttons-menus.css')).toEqual([]);
});

// Every segmented control is S2 size L (40px), so a time range in a card matches a page filter.
function segmentedHeights(css: string): string[] {
  const values: string[] = [];
  transform({
    filename: 'segmented.css',
    code: new TextEncoder().encode(css),
    visitor: {
      Rule: {
        style(rule) {
          const segmented = rule.value.selectors.some(selector => selector.some(part => part.type === 'class' && part.name === 'rp-seg'));
          if (!segmented) return;
          for (const declaration of [...rule.value.declarations.declarations, ...rule.value.declarations.importantDeclarations]) {
            const property = declaration.property === 'unparsed' ? declaration.value.propertyId.property : declaration.property;
            if (property in dimensions && property !== 'min-height') values.push(JSON.stringify(declaration.value));
          }
        }
      }
    }
  });
  return values;
}

it('sizes every segmented control at L only', () => {
  const heights = segmentedHeights(segmentedCss);
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.filter(value => !value.includes('"--rp-control-lg"'))).toEqual([]);
  const items: Array<[string, string]> = [
    ['a', 'A'],
    ['b', 'B']
  ];
  const segmented = createElement(Segmented, {items, value: 'a', onChange: () => {}, label: 'Range'});
  for (const markup of [renderToStaticMarkup(segmented), renderToStaticMarkup(createElement(ControlSizeContext, {value: null}, segmented))]) {
    expect(markup.match(/data-size="[^"]*"/g)).toEqual(Array(3).fill('data-size="L"'));
  }
});
