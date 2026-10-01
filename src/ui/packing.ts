export type Box = {top: number; bottom: number; left: number; right: number};

// How far each card grows downwards: to the gap above the nearest card below it in any of its columns, or to the
// section's end when nothing is below it, so neighbouring columns end level and cards in one row share its height.
export function fills(boxes: readonly Box[], gap: number): number[] {
  const end = Math.max(0, ...boxes.map(box => box.bottom));
  return boxes.map(box => {
    const below = boxes.filter(other => other !== box && other.top >= box.bottom && other.left < box.right - 1 && other.right > box.left + 1);
    const limit = below.length ? Math.min(...below.map(other => other.top)) - gap : end;
    return Math.max(0, Math.round(limit - box.bottom));
  });
}

// The element whose size is the card's content: the cell's last child, through wrappers that draw no box.
function content(cell: Element): Element | null {
  let node = cell.lastElementChild;
  while (node && getComputedStyle(node).display === 'contents') node = node.lastElementChild;
  return node;
}

// A section's control cards share one layout: inline (label and control on one line) when every one of them fits on
// one line at its width, otherwise stacked, so cards in a row never mix the two.
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
  const pack = () => {
    const list = cells();
    const controls = [...section.querySelectorAll<HTMLElement>('.rp-control-card > .rp-row')];
    if (controls.length) {
      section.dataset.controls = 'probe';
      section.dataset.controls = controlLayout(controls.map(row => ({natural: row.scrollWidth, width: row.clientWidth})));
    } else delete section.dataset.controls;
    section.dataset.measure = '';
    const heights = list.map(cell => Math.ceil(cell.getBoundingClientRect().height));
    delete section.dataset.measure;
    const gap = Number.parseFloat(getComputedStyle(section).columnGap) || 0;
    list.forEach((cell, i) => cell.style.setProperty('--rp-rows', String(heights[i] + gap)));
    section.dataset.packed = '';
    const origin = section.getBoundingClientRect();
    const boxes = list.map(cell => {
      const box = cell.getBoundingClientRect();
      return {top: box.top - origin.top, bottom: box.bottom - origin.top, left: box.left, right: box.right};
    });
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
  changes.observe(section, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-size']});
  pack();
  return () => {
    cancelAnimationFrame(frame);
    sizes.disconnect();
    changes.disconnect();
    texts.disconnect();
    delete section.dataset.packed;
  };
}
