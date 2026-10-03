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

// A section's control cards share one layout: inline (label and control on one line) when every one of them fits on
// one line at its width, otherwise stacked, so cards in a row never mix the two. A label cut to an ellipsis does not
// fit, so the rows are measured with every label whole, and each label again on the inline line.
export const controlLayout = (rows: ReadonlyArray<{natural: number; width: number}>) =>
  rows.every(row => row.natural <= row.width + 0.5) ? 'inline' : 'stacked';

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
  const pack = () => {
    const list = cells();
    const controls = [...section.querySelectorAll<HTMLElement>('.rp-control-card > .rp-row')];
    if (controls.length) {
      const fit = (nodes: HTMLElement[]) => controlLayout(nodes.map(node => ({natural: node.scrollWidth, width: node.clientWidth})));
      section.dataset.controls = 'probe';
      let layout = fit(controls);
      if (layout === 'inline') {
        section.dataset.controls = layout;
        layout = fit([...section.querySelectorAll<HTMLElement>('.rp-control-card > .rp-row > .rp-qlabel > .rp-truncate')]);
      }
      section.dataset.controls = layout;
    } else delete section.dataset.controls;
    const gap = gapOf();
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
  };
}
