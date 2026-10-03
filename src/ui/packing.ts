// `band` is the card's height step: cards grow only to match cards of their own step.
export type Box = {top: number; bottom: number; left: number; right: number; band?: string};

// How far each card grows downwards: to the lowest end among the cards of its height step beside it, those whose span
// overlaps its own, so cards of one step in one row share its height and a card stacked beside one of its step ends
// level with it, but never past the gap above the nearest card below it in any of its columns. A card of another step
// keeps its own height, as a widget on a phone's grid does, and the space beside it stays for the cards that follow. A
// short card does not grow to the end of a stack beside it that only starts level with it.
export function fills(boxes: readonly Box[], gap: number): number[] {
  return boxes.map(box => {
    const below = boxes.filter(other => other !== box && other.top >= box.bottom && other.left < box.right - 1 && other.right > box.left + 1);
    const row = Math.max(
      ...boxes.filter(other => other.band === box.band && other.top < box.bottom - 0.5 && other.bottom > box.top + 0.5).map(other => other.bottom)
    );
    const limit = below.length ? Math.min(row, ...below.map(other => other.top - gap)) : row;
    return Math.max(0, Math.round(limit - box.bottom));
  });
}

// Value tiles of one height step in one row share one layout: when any of them stacks its value and sparkline, every
// such tile stacks them, so tiles of one height never mix the two. A short tile is always one line and never stacks.
export const tileLayouts = (tiles: ReadonlyArray<{top: number; stacks: boolean; band?: string}>) => {
  const key = (tile: {top: number; band?: string}) => `${Math.round(tile.top)} ${tile.band}`;
  const stacked = new Set(tiles.filter(tile => tile.stacks).map(key));
  return tiles.map(tile => (tile.band !== 'short' && stacked.has(key(tile)) ? 'stacked' : 'inline'));
};
// A card's height step; a card without one is standard.
const band = (cell: HTMLElement) => cell.dataset.height ?? 'standard';
// A tile stacks when it is too narrow for its value and sparkline on one line, which its tile container query tells
// (see cards-dashboard.css), or when its height is tall, which gives the sparkline the card's full width. A short tile,
// one cell high, keeps them on one line with a narrower sparkline (see dashboard.css).
const stacks = (cell: HTMLElement) =>
  band(cell) !== 'short' &&
  (band(cell) === 'tall' || getComputedStyle(cell.querySelector('.rp-tile-body')!).getPropertyValue('--rp-tile-stack').trim() === '1');

// The element whose size is the card's content: an editor cell's body, whose edge handles follow it, else the cell's
// last child, through wrappers that draw no box.
function content(cell: Element): Element | null {
  let node = cell.querySelector('.rp-dashboard-body') ?? cell.lastElementChild;
  while (node && getComputedStyle(node).display === 'contents') node = node.lastElementChild;
  return node;
}

// A control card's line: its label and its control.
const line = '.rp-control-card > .rp-row';
// A section's control cards share one layout: inline (label and control on one line) when every one of them fits on
// one line at its width, otherwise stacked, so cards in a row never mix the two. A label cut to an ellipsis does not
// fit, so the rows are measured with every label whole, and each label again on the inline line.
export const controlLayout = (rows: ReadonlyArray<{natural: number; width: number}>) =>
  rows.every(row => row.natural <= row.width + 0.5) ? 'inline' : 'stacked';

// The tracks of the fraction grid's `tracks` each card of a full row of Auto one-line cards spans: first its line
// whole (`natural`, the line's widest content and the card's padding), then the rest of the row shared in proportion to
// the width its footprint gives it (`width`), rounded to whole tracks without leaving any card short of its line. None
// when the lines do not all fit the row, which then keeps its footprints and stacks (see packSection).
export function fitSpans(cards: ReadonlyArray<{natural: number; width: number}>, gap: number, tracks = 420): number[] | undefined {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const row = sum(cards.map(card => card.width));
  const lines = sum(cards.map(card => card.natural));
  // A row and the gap before it span every track, each card its width and one gap.
  const unit = (row + cards.length * gap) / tracks;
  const least = cards.map(card => Math.ceil((card.natural + gap) / unit - 1e-6));
  if (lines > row || sum(least) > tracks) return undefined;
  const ideal = cards.map(card => (card.natural + ((row - lines) * card.width) / row + gap) / unit);
  const spans = ideal.map((value, i) => Math.max(least[i], Math.floor(value)));
  // Tracks left over go to the cards furthest below their share; tracks short come from those furthest above it.
  for (let left = tracks - sum(spans); left !== 0; left += left > 0 ? -1 : 1) {
    const order = spans.map((_, i) => i).filter(i => left > 0 || spans[i] > least[i]);
    const pick = order.reduce((best, i) => ((ideal[i] - spans[i]) * Math.sign(left) > (ideal[best] - spans[best]) * Math.sign(left) ? i : best));
    spans[pick] += Math.sign(left);
  }
  return spans;
}

// Masonry packing for a section grid of 1px rows: each cell spans its content's height plus the gap, so the grid's
// auto-placement puts a card right under the card above it in its column, then the last card of each column grows by
// `fills`. Heights are read with the cells unstretched, so a grown card never feeds back into its own size. Returns the
// function that stops packing.
export function packSection(section: HTMLElement): () => void {
  const cells = () =>
    [...section.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('rp-dashboard-cell'));
  const watched = new Set<Element>();
  let frame = 0;
  const gapOf = () => Number.parseFloat(getComputedStyle(section).getPropertyValue('--rp-dash-gap')) || 0;
  // Each cell spans its content's height plus the gap; heights are read with the cells unstretched, so a grown card
  // never feeds back into its own size.
  const place = (list: HTMLElement[], gap: number) => {
    section.dataset.measure = '';
    const heights = list.map(cell => Math.ceil(cell.getBoundingClientRect().height));
    delete section.dataset.measure;
    list.forEach((cell, i) => cell.style.setProperty('--rp-rows', String(heights[i] + gap)));
    section.dataset.packed = '';
    const origin = section.getBoundingClientRect();
    const boxes = list.map(cell => {
      const box = cell.getBoundingClientRect();
      return {top: box.top - origin.top, bottom: box.bottom - origin.top, left: box.left, right: box.right, band: band(cell)};
    });
    return {heights, boxes};
  };
  // A full row of Auto cards that each have one line (a control card's) spans the fraction grid by `fitSpans`, so each
  // card's line fits whole wherever the row can hold them all, and the spare width follows the footprints. Rows are read
  // with every card at its footprint; the lines with nothing in them shrinking or wrapping (`data-controls` probe).
  const unfit = (list: HTMLElement[]) => {
    delete section.dataset.fit;
    for (const cell of list) for (const name of ['--rp-span', '--rp-shift', '--rp-trim']) cell.style.removeProperty(name);
  };
  const fitRows = (list: HTMLElement[], gap: number) => {
    unfit(list);
    const lineOf = (cell: HTMLElement) => cell.querySelector<HTMLElement>(line);
    const style = getComputedStyle(section);
    if (!list.some(lineOf) || style.getPropertyValue('--rp-dash-snap').trim() === 'none') return;
    const visible = section.getBoundingClientRect().width + Math.min(0, Number.parseFloat(style.marginInlineStart) || 0);
    const boxes = list.map(cell => cell.getBoundingClientRect());
    const rows = new Map<number, number[]>();
    boxes.forEach((box, i) => {
      const top = Math.round(box.top);
      rows.set(top, [...(rows.get(top) ?? []), i]);
    });
    const full = [...rows.values()].filter(
      row =>
        row.length > 1 &&
        row.every(i => !list[i].dataset.width && list[i].dataset.size !== 'wide' && lineOf(list[i])) &&
        Math.abs(Math.max(...row.map(i => boxes[i].right)) - Math.min(...row.map(i => boxes[i].left)) - visible) <= 1
    );
    if (!full.length) return;
    // A card's padding is its width less its line's; the line's own width is then read at its content, with a pixel to
    // spare for the whole-pixel widths the layout check reads.
    const padding = new Map(full.flat().map(i => [i, boxes[i].width - lineOf(list[i])!.getBoundingClientRect().width]));
    section.dataset.lines = 'probe';
    const natural = new Map(full.flat().map(i => [i, Math.ceil(lineOf(list[i])!.getBoundingClientRect().width + padding.get(i)!) + 1]));
    delete section.dataset.lines;
    for (const row of full) {
      const spans = fitSpans(
        row.map(i => ({natural: natural.get(i)!, width: boxes[i].width})),
        gap
      );
      if (!spans) continue;
      section.dataset.fit = '';
      row.forEach((i, at) => {
        list[i].style.setProperty('--rp-span', String(spans[at]));
        list[i].style.setProperty('--rp-shift', '0');
        list[i].style.setProperty('--rp-trim', '0');
      });
    }
  };
  const pack = () => {
    const list = cells();
    const controls = [...section.querySelectorAll<HTMLElement>(line)];
    const gap = gapOf();
    if (controls.length) section.dataset.controls = 'probe';
    fitRows(list, gap);
    if (controls.length) {
      const fit = (nodes: HTMLElement[]) => controlLayout(nodes.map(node => ({natural: node.scrollWidth, width: node.clientWidth})));
      let layout = fit(controls);
      if (layout === 'inline') {
        section.dataset.controls = layout;
        layout = fit([...section.querySelectorAll<HTMLElement>('.rp-control-card > .rp-row > .rp-qlabel > .rp-truncate')]);
      }
      section.dataset.controls = layout;
    } else delete section.dataset.controls;
    // Columns depend on width alone, so whether a tile stacks is known before packing; its row is known after.
    const tiles = list.filter(cell => cell.querySelector('.rp-tile-body'));
    const own = tiles.map(stacks);
    tiles.forEach((cell, i) => (cell.dataset.tile = own[i] ? 'stacked' : 'inline'));
    let {heights, boxes} = place(list, gap);
    const layouts = tileLayouts(tiles.map((cell, i) => ({top: boxes[list.indexOf(cell)].top, stacks: own[i], band: band(cell)})));
    if (tiles.some((cell, i) => cell.dataset.tile !== layouts[i])) {
      tiles.forEach((cell, i) => (cell.dataset.tile = layouts[i]));
      ({heights, boxes} = place(list, gap));
    }
    fills(boxes, gap).forEach((fill, i) => {
      if (fill) list[i].style.setProperty('--rp-rows', String(heights[i] + gap + fill));
    });
    // A grown card keeps its size when its content shrinks, so its children are watched too.
    const current = new Set(
      list.flatMap(cell => {
        const node = content(cell);
        return node ? [node, ...node.children] : [];
      })
    );
    for (const node of watched)
      if (!current.has(node)) {
        sizes.unobserve(node);
        watched.delete(node);
      }
    for (const node of current)
      if (!watched.has(node)) {
        sizes.observe(node);
        watched.add(node);
      }
    // A control's words can change without changing its box (a shrinking label), so its text is watched.
    texts.disconnect();
    for (const row of controls) texts.observe(row, {subtree: true, childList: true, characterData: true});
    // The editor's row hints read the packed boxes.
    section.dispatchEvent(new Event('rp-packed'));
  };
  const later = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      pack();
    });
  };
  // Content that grows or a new width packs again in the next frame, which keeps the observer out of a loop.
  const sizes = new ResizeObserver(() => later());
  const texts = new MutationObserver(() => later());
  sizes.observe(section);
  // Cards added, removed, moved or resized, and content that changes shape inside a card, such as a chart replacing its
  // placeholder, pack before the next paint, so a card is never drawn at a stale size.
  const changes = new MutationObserver(pack);
  changes.observe(section, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-size', 'data-width', 'data-height']});
  pack();
  return () => {
    cancelAnimationFrame(frame);
    sizes.disconnect();
    changes.disconnect();
    texts.disconnect();
    delete section.dataset.packed;
    unfit(cells());
  };
}
