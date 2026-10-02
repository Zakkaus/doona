import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {WidgetGrid, WidgetCell} from './WidgetGrid';
import {WidgetGalleryTile} from './WidgetGalleryTile';
import {FloatingPanel} from './FloatingPanel';
import {anchorPanelOffset, edgePlacement, fitPanelOffset, minPanelSize, nearestEdge, resizePanel} from './panelSize';
const panel = {label: 'honk', resizeLabel: 'Resize', moveLabel: 'Move', movedText: 'Moved', onResize: () => {}, onMove: () => {}, header: 'head'};
it('renders widget size metadata', () => {
  expect(
    renderToStaticMarkup(
      <WidgetGrid>
        <WidgetCell id="cpu" size="small">
          12%
        </WidgetCell>
      </WidgetGrid>
    )
  ).toContain('data-size="small"');
});
it('names a gallery item above its preview and disables a placed one before the preview loads', () => {
  const html = renderToStaticMarkup(
    <WidgetGalleryTile id="cpu" label="CPU" added addLabel="Add" count="3/3 placed" onAdd={() => {}}>
      12%
    </WidgetGalleryTile>
  );
  expect(html.indexOf('<h3')).toBeLessThan(html.indexOf('rp-widget-gallery-frame'));
  expect(html).toContain('disabled');
  expect(html).toContain('3/3 placed');
  expect(html).not.toContain('12%');
});
it('is as wide as the narrowest resize before the reader sizes it, and a saved width wins', () => {
  expect(renderToStaticMarkup(<FloatingPanel {...panel} />)).toContain(`--rp-panel-width:${minPanelSize.width}px`);
  expect(renderToStaticMarkup(<FloatingPanel {...panel} size={{width: 400, height: 300}} />)).toContain('--rp-panel-width:400px');
});
it.each([
  [false, true],
  [true, false]
])('a resized panel collapsed=%s keeps its height only while expanded', (collapsed, expanded) => {
  const html = renderToStaticMarkup(<FloatingPanel {...panel} size={{width: 320, height: 480}} collapsed={collapsed} />);
  expect(html).toContain('--rp-panel-width:320px');
  expect(html.includes('--rp-panel-height:480px')).toBe(expanded);
  expect(html.includes('aria-label="Resize"')).toBe(expanded);
});
it.each([
  ['keeps an offset that fits', {x: 100, y: 50}, {x: 100, y: 50}],
  ['pulls an offset back inside a narrow window', {x: 900, y: 50}, {x: 408, y: 50}],
  ['keeps the whole panel inside the frame', {x: 0, y: 900}, {x: 0, y: 568}],
  ['keeps the edge it is measured from', {x: 0, y: 900, top: true as const}, {x: 0, y: 568, top: true}]
])('%s', (_name, offset, expected) => expect(fitPanelOffset(offset, {width: 768, height: 768}, {width: 360, height: 200})).toEqual(expected));
// A 100px panel in a 700px frame is measured from the edge nearer its centre, so it grows towards the room it has.
it.each([
  ['near the top it keeps its top edge', {x: 8, y: 560}, {x: 8, y: 40, top: true}],
  ['near the bottom it keeps its bottom edge', {x: 8, y: 40}, {x: 8, y: 40}],
  ['moved down from the top it changes edge', {x: 8, y: 560, top: true as const}, {x: 8, y: 40}],
  ['at the very top', {x: 0, y: 600}, {x: 0, y: 0, top: true}]
])('%s', (_name, offset, expected) => expect(anchorPanelOffset(offset, 700, 100)).toEqual(expected));
it('a panel kept by its top edge grows downwards from its bottom handle and moves its offset from its top handle', () => {
  const top = {size: {width: 400, height: 400}, offset: {x: 100, y: 100, top: true as const}};
  expect(resizePanel(top, {block: 'end'}, 0, 40)).toEqual({size: {width: 400, height: 440}, offset: {x: 100, y: 100, top: true}});
  expect(resizePanel(top, {block: 'start'}, 0, -40)).toEqual({size: {width: 400, height: 440}, offset: {x: 100, y: 60, top: true}});
});
it.each([
  ['top', {block: 'start'}, 0, -2000, {width: 400, height: 700}, {x: 100, y: 100}],
  ['start', {inline: 'start'}, -2000, 0, {width: 600, height: 400}, {x: 100, y: 100}],
  ['top start', {inline: 'start', block: 'start'}, -2000, -2000, {width: 600, height: 700}, {x: 100, y: 100}],
  ['top of a panel kept by its top edge', {block: 'start'}, 0, -2000, {width: 400, height: 500}, {x: 100, y: 0, top: true}]
] as const)('the %s handle dragged past the window keeps the panel inside its frame', (_name, edge, toEnd, down, size, offset) => {
  const at = _name.includes('kept') ? {x: 100, y: 100, top: true as const} : {x: 100, y: 100};
  expect(resizePanel({size: {width: 400, height: 400}, offset: at}, edge, toEnd, down, {width: 700, height: 800})).toEqual({size, offset});
});
it('a panel grows no taller than its content', () => {
  expect(resizePanel({size: {width: 400, height: 400}, offset: {x: 0, y: 0}}, {block: 'start'}, 0, -300, undefined, 520).size.height).toBe(520);
});
it('draws a moved panel at its offset fitted to the window, and the header as its move handle', () => {
  Object.assign(globalThis, {innerWidth: 800, innerHeight: 768});
  const html = renderToStaticMarkup(<FloatingPanel {...panel} offset={{x: 900, y: 40}} />);
  expect(html).toContain('style="--rp-panel-x:488px;--rp-panel-y:40px"');
  expect(html).toContain('style="--rp-panel-width:280px"');
  expect(html).toContain('class="rp-panel-move" aria-label="Move"');
});
// From a 400x400 panel 100px from its home corner, a handle dragged 40px towards the inline end and 40px down: the
// opposite corner or edge stays put, so a handle at the end or bottom moves the offset by what the panel grows.
const base = {size: {width: 400, height: 400}, offset: {x: 100, y: 100}};
it.each([
  ['top start', {inline: 'start', block: 'start'}, {width: 360, height: 360}, {x: 100, y: 100}],
  ['top end', {inline: 'end', block: 'start'}, {width: 440, height: 360}, {x: 60, y: 100}],
  ['bottom start', {inline: 'start', block: 'end'}, {width: 360, height: 440}, {x: 100, y: 60}],
  ['bottom end', {inline: 'end', block: 'end'}, {width: 440, height: 440}, {x: 60, y: 60}],
  ['top edge', {block: 'start'}, {width: 400, height: 360}, {x: 100, y: 100}],
  ['end edge', {inline: 'end'}, {width: 440, height: 400}, {x: 60, y: 100}]
] as const)('the %s handle keeps the opposite side fixed', (_name, edge, size, offset) => expect(resizePanel(base, edge, 40, 40)).toEqual({size, offset}));
it('a handle at the home corner grows only as far as the offset allows, and within the size limits', () => {
  expect(resizePanel({...base, offset: {x: 10, y: 0}}, {inline: 'end', block: 'end'}, 40, 40)).toEqual({size: {width: 410, height: 400}, offset: {x: 0, y: 0}});
  expect(resizePanel(base, {inline: 'start', block: 'start'}, 400, -900)).toEqual({size: {width: 280, height: 960}, offset: {x: 100, y: 100}});
});
it('draws eight resize hit areas, one of them a keyboard stop', () => {
  const html = renderToStaticMarkup(<FloatingPanel {...panel} />);
  expect(html.match(/class="rp-panel-resize"/g)).toHaveLength(8);
  expect(html.match(/tabindex="-1"/g)).toHaveLength(7);
});
const view = {width: 1440, height: 900};
// The summary is a control high along a side edge and as wide as the docked section along the top or bottom.
it.each([
  ['the default corner hides sideways', {left: 1104, top: 500, width: 320, height: 300}, 'right', 32, {at: 634, shift: {x: 336, y: 0}}],
  ['near the left', {left: 40, top: 300, width: 320, height: 300}, 'left', 32, {at: 434, shift: {x: -360, y: 0}}],
  ['near the top', {left: 600, top: 20, width: 320, height: 200}, 'top', 208, {at: 656, shift: {x: 0, y: -220}}],
  ['near the bottom', {left: 600, top: 780, width: 320, height: 100}, 'bottom', 208, {at: 656, shift: {x: 0, y: 120}}],
  ['a side summary stays inside the viewport', {left: 1120, top: 0, width: 320, height: 20}, 'right', 32, {at: 0, shift: {x: 320, y: 0}}],
  ['a bottom summary stays inside the viewport', {left: 1350, top: 880, width: 80, height: 20}, 'bottom', 208, {at: 1232, shift: {x: 0, y: 20}}]
] as const)('%s', (_name, box, edge, length, placement) => {
  expect(nearestEdge(box, view)).toBe(edge);
  expect(edgePlacement(box, view, edge, length)).toEqual(placement);
});
// Equal gaps go to the first of right, left, bottom and top.
it.each([
  ['right over bottom', {left: 1120, top: 580, width: 320, height: 320}, 'right'],
  ['right over left', {left: 0, top: 300, width: 1440, height: 300}, 'right'],
  ['left over bottom', {left: 0, top: 600, width: 320, height: 300}, 'left'],
  ['bottom over top', {left: 560, top: 0, width: 320, height: 900}, 'bottom']
] as const)('a tie: %s', (_name, box, edge) => expect(nearestEdge(box, view)).toBe(edge));
