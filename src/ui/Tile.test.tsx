import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ValueTile} from './Tile';

const body = (inner: string) => `<div class="rp-tile-body" data-pack="tile">${inner}</div>`;

it('shows the value and its sparkline, or the status in the sparkline’s place', () => {
  expect(renderToStaticMarkup(<ValueTile value="4%" spark={<i />} />)).toBe(body('<span class="rp-tile-val">4%</span><span class="rp-spark"><i></i></span>'));
  expect(renderToStaticMarkup(<ValueTile value="4%" spark={false} />)).toBe(body('<span class="rp-tile-val">4%</span>'));
  expect(renderToStaticMarkup(<ValueTile value="4%" spark={<i />} status={<b />} />)).toBe(body('<span class="rp-tile-val">4%</span><b></b>'));
});

it('shows its children alone until the value is known', () => {
  expect(renderToStaticMarkup(<ValueTile value="4%">Loading</ValueTile>)).toBe(body('Loading'));
  expect(renderToStaticMarkup(<ValueTile value="4%">{false}</ValueTile>)).toBe(body('<span class="rp-tile-val">4%</span>'));
});
