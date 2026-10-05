import {expect, it} from 'vitest';
import {translate} from '../i18n';
import {palettes} from './palettes';
import {swatchOf} from './swatches';
import {paletteMenu} from './view';

it('draws every palette differently: its colours, or for Liquid Glass, whose tokens are Glass’s, its lens', () => {
  const drawn = palettes.map(({id}) => JSON.stringify(swatchOf(id)));
  expect(new Set(drawn).size).toBe(palettes.length);
});

it('heads every palette section, gathering the palettes alone in their family under Other, in list order', () => {
  const sections = paletteMenu(key => translate('en', key));
  expect(sections.map(section => [section.title, section.items.length])).toEqual([
    ['Rosé Pine', 2],
    ['Catppuccin', 3],
    ['ByteDance', 2],
    ['Glass', 4],
    ['Other', 4]
  ]);
  expect(sections.at(-1)).toMatchObject({plain: true, items: [{id: 'nord/nord'}, {id: 'kary/kary'}, {id: 'antd/antd'}, {id: 'qiangguo/qiangguo'}]});
  expect(sections.flatMap(section => section.items).length).toBe(palettes.length);
});
