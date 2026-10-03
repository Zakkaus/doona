import {useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import {mergeProps, useDrop, VisuallyHidden} from 'react-aria';
import type {CanvasPlace} from './SortableCanvas';

const cardType = 'application/x-doona-card';
// The card being dragged in edit mode, set by its canvas: a drag's data is unreadable until the drop. A drag over a
// space asks often whether the card fits, so each drag measures the card once per space.
const dragged: {card?: string} = {};
const measured = new Map<string, boolean>();
const ended = new Set<() => void>();
export const dragStarted = (card: string | undefined) => {
  dragged.card = card;
  measured.clear();
  if (card === undefined) for (const end of ended) end();
};
const cellOf = (id: string | undefined) => [...document.querySelectorAll<HTMLElement>('.rp-dashboard-cell')].find(cell => cell.dataset.instance === id);
// A card's width once dropped after `after` in `section`, by the section's own rules: a stand-in with the card's layout
// attributes takes that place for one measurement, while the card itself, when it is in this section, steps out of its
// rules. Its chosen width puts the section on the fraction grid, as the drop would.
function widthAfterDrop(section: HTMLElement, id: string, after: string): number | undefined {
  const card = cellOf(id);
  const anchor = cellOf(after);
  if (!card || anchor?.parentElement !== section) return undefined;
  const probe = document.createElement('div');
  probe.className = 'rp-dashboard-cell';
  probe.style.visibility = 'hidden';
  for (const name of ['data-module', 'data-size', 'data-foot', 'data-width', 'data-height']) {
    const value = card.getAttribute(name);
    if (value !== null) probe.setAttribute(name, value);
  }
  const grid = section.dataset.grid;
  if (probe.dataset.width) section.dataset.grid = 'fraction';
  const home = card.parentElement === section;
  if (home) card.classList.remove('rp-dashboard-cell');
  anchor.after(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  if (home) card.classList.add('rp-dashboard-cell');
  if (grid === undefined) delete section.dataset.grid;
  else section.dataset.grid = grid;
  return width;
}
type Gap = {after: string; left: number; top: number; width: number; height: number; share: string};
type Rect = {id: string; left: number; right: number; top: number; bottom: number};

// The simplest fraction, to twelfths, nearest to `share` of a row.
function shareLabel(share: number) {
  let best = [1, 1];
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(share * q);
    if (p > 0 && Math.abs(share - p / q) < Math.abs(share - best[0] / best[1]) - 1e-9) best = [p, q];
  }
  return `${best[0]}/${best[1]}`;
}

// The free space at the inline end of each packed row: from the row's last card to the section's end, down to the row's
// lowest card, short of any card that reaches into it from another row. A space under a sixth of the row is none.
function rowGaps(cells: readonly Rect[], width: number, gap: number, rtl: boolean): Array<Omit<Gap, 'share'>> {
  // Mirrored for right-to-left, so the row's end is always on the right.
  const boxes = rtl ? cells.map(cell => ({...cell, left: width - cell.right, right: width - cell.left})) : cells;
  const rows = new Map<number, Rect[]>();
  for (const box of boxes) rows.set(Math.round(box.top), [...(rows.get(Math.round(box.top)) ?? []), box]);
  return [...rows.values()].flatMap(row => {
    const top = row[0].top;
    const bottom = Math.max(...row.map(box => box.bottom));
    const left = Math.max(...row.map(box => box.right)) + gap;
    let right = width;
    for (const other of boxes)
      if (!row.includes(other) && other.top < bottom - 0.5 && other.bottom > top + 0.5 && other.right > left) right = Math.min(right, other.left - gap);
    if ((right - left + gap) / (width + gap) < 1 / 6 - 0.01) return [];
    return [{after: row.at(-1)!.id, left: rtl ? width - right : left, top, width: right - left, height: bottom - top}];
  });
}

// Edit mode's row hints over a packed section: each row's free space at its end, named by its share of the row, and a
// drop target that puts a card that fits after the row's last card. They take no grid cell, so packing never sees them.
export function DashboardGaps({
  section,
  label,
  refusal = '',
  onPlace
}: {
  section: RefObject<HTMLElement | null>;
  label: (share: string) => string;
  refusal?: string;
  onPlace: (id: string, place: CanvasPlace) => void;
}) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  useLayoutEffect(() => {
    const element = section.current;
    if (!element) return;
    const measure = () => {
      const frame = element.parentElement!.getBoundingClientRect();
      const style = getComputedStyle(element);
      const gap = Number.parseFloat(style.getPropertyValue('--rp-dash-gap')) || 0;
      const cells = [...element.querySelectorAll<HTMLElement>(':scope > .rp-dashboard-cell')].map(cell => {
        const box = cell.getBoundingClientRect();
        return {
          id: cell.dataset.instance!,
          left: box.left - frame.left,
          right: box.right - frame.left,
          top: box.top - frame.top,
          bottom: box.bottom - frame.top
        };
      });
      const next = rowGaps(cells, frame.width, gap, style.direction === 'rtl').map(free => ({
        ...free,
        share: shareLabel((free.width + gap) / (frame.width + gap))
      }));
      setGaps(previous => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    measure();
    element.addEventListener('rp-packed', measure);
    return () => element.removeEventListener('rp-packed', measure);
  }, [section]);
  return gaps.map(gap => <GapTarget key={gap.after} section={section} gap={gap} label={label(gap.share)} refusal={refusal} onPlace={onPlace} />);
}

// A card wider than the space, at the width this section gives it, would only start a new row, so the space refuses
// it: it shows the refusal while the card is over it, says why, and takes no drop.
function GapTarget({
  section,
  gap,
  label,
  refusal,
  onPlace
}: {
  section: RefObject<HTMLElement | null>;
  gap: Gap;
  label: string;
  refusal: string;
  onPlace: (id: string, place: CanvasPlace) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [refused, setRefused] = useState(false);
  const fits = (id = dragged.card) => {
    const element = section.current;
    if (id === undefined || !element) return false;
    const key = [id, gap.after, gap.width].join('\n');
    if (!measured.has(key)) measured.set(key, (widthAfterDrop(element, id, gap.after) ?? Infinity) <= gap.width + 1);
    return measured.get(key)!;
  };
  const {dropProps, isDropTarget} = useDrop({
    ref,
    getDropOperation: types => (types.has(cardType) && fits() ? 'move' : 'cancel'),
    onDrop: async event => {
      for (const item of event.items) {
        if (item.kind !== 'text' || !item.types.has(cardType)) continue;
        const id = await item.getText(cardType);
        if (fits(id)) onPlace(id, {target: gap.after, after: true});
      }
    }
  });
  const over = {
    onDragEnter: () => setRefused(dragged.card !== undefined && !fits()),
    onDragLeave: () => setRefused(false),
    onDrop: () => setRefused(false)
  };
  // A refused drop ends with neither dragleave nor drop in WebKit, so the drag's end clears the refusal too.
  useEffect(() => {
    const end = () => setRefused(false);
    ended.add(end);
    return () => void ended.delete(end);
  }, []);
  return (
    <div
      {...mergeProps(dropProps, over)}
      ref={ref}
      className="rp-dashboard-gap rp-label"
      data-drop-target={isDropTarget || undefined}
      data-refused={refused || undefined}
      style={{left: gap.left, top: gap.top, width: gap.width, height: gap.height}}
    >
      {label}
      <VisuallyHidden>
        <span role="status">{refused ? refusal : ''}</span>
      </VisuallyHidden>
    </div>
  );
}
