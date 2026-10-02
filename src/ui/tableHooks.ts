import {useEffect, useRef, useState, type RefObject} from 'react';
import {type Selection} from 'react-aria-components';
import {revealFlowRow} from './tableFlow';

export function revealScrollTop(scrollTop: number, viewportHeight: number, row: {y: number; height: number}) {
  if (row.y < scrollTop + tableLayout.headingHeight) return row.y - tableLayout.headingHeight;
  if (row.y + row.height > scrollTop + viewportHeight) return row.y + row.height - viewportHeight;
  return scrollTop;
}

// Scrolls a selected row into view when the selection changes or the selected row first appears (a deep link
// before the rows load). A poll that only moves the row does not scroll: the person may have scrolled away.
export function useTableReveal(
  selected: string | null,
  at: number,
  ref: RefObject<HTMLElement | null>,
  flow?: boolean,
  rowBounds?: (key: string) => {y: number; height: number} | null
) {
  const index = useRef(at);
  const measure = useRef(rowBounds);
  useEffect(() => {
    index.current = at;
    measure.current = rowBounds;
  });
  const present = at >= 0;
  useEffect(() => {
    const at = index.current;
    if (!selected || !present) return;
    const place = () => {
      const box = ref.current;
      if (!box) return;
      const measured = measure.current?.(selected);
      const top = measured?.y ?? tableLayout.headingHeight + at * tableLayout.rowHeight;
      const bottom = top + (measured?.height ?? tableLayout.rowHeight);
      if (flow) {
        revealFlowRow(box, top, bottom);
        return;
      }
      box.scrollTop = revealScrollTop(box.scrollTop, box.clientHeight, {y: top, height: measured?.height ?? tableLayout.rowHeight});
    };
    const frame = requestAnimationFrame(place);
    // The table may still settle its height after the reveal (a tab bar, the detail panel); until the person
    // scrolls it themselves, a resize keeps the selected row in view.
    const box = ref.current;
    let held = true;
    const release = () => (held = false);
    const observer = new ResizeObserver(() => held && place());
    if (box) {
      observer.observe(box);
      for (const type of ['wheel', 'pointerdown', 'touchstart'] as const) box.addEventListener(type, release, {passive: true});
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (box) for (const type of ['wheel', 'pointerdown', 'touchstart'] as const) box.removeEventListener(type, release);
    };
  }, [selected, present, ref, flow]);
}

export function selectedRow(keys: Selection): string | null {
  return keys === 'all' || !keys.size ? null : String([...keys][0]);
}

export function fitColumns<C extends {id: string; minWidth: number; drop?: number; text?: 'wrap'}>(cols: C[], width: number | null, phone = false): C[] {
  if (width === null) return cols;
  if (phone) {
    let preceding = 0;
    return cols.map(column => {
      const minWidth = column.text === 'wrap' ? Math.min(column.minWidth, Math.max(0, width - preceding)) : column.minWidth;
      preceding += minWidth;
      return minWidth === column.minWidth ? column : {...column, minWidth};
    });
  }
  const kept = new Set(cols.map(column => column.id));
  let total = cols.reduce((sum, column) => sum + column.minWidth, 0);
  for (const column of [...cols].filter(column => column.drop).sort((a, b) => a.drop! - b.drop!)) {
    if (total <= width) break;
    kept.delete(column.id);
    total -= column.minWidth;
  }
  return kept.size === cols.length ? cols : cols.filter(column => kept.has(column.id));
}

// Heights match tables-forms.css: a row is 40px; a heading is 8px padding twice, a 20px line and a 1px border.
export const tableLayout = {rowHeight: 40, headingHeight: 37};
// A table's height: its rows' height up to `height`, but a table that has shown its full height while loading keeps
// it, since growing from two rows to full height, or shrinking back when few rows arrive, moves everything below it.
// A short list (`fit`) holds two rows while loading instead and then fits what arrives.
export function useTableHeight(height: number, count: number, loading?: boolean, fit?: boolean) {
  const [reserved, setReserved] = useState(!fit && !!loading && !count);
  if (!fit && !reserved && loading && !count) setReserved(true);
  // Include the border-box frame to avoid a two-pixel scroll on short tables. Two rows hold the empty or loading message.
  const content = 2 + tableLayout.headingHeight + (count || 2) * tableLayout.rowHeight;
  return reserved ? height : Math.min(height, content);
}
// Rows built once per source object. A list re-read unchanged keeps its objects (replaceEqualDeep), so their rows keep
// their identity too, and the table re-renders only rows whose source changed. A new cache starts over.
export function cachedRows<T extends object, R>(cache: WeakMap<T, R>, items: T[], build: (item: T) => R): R[] {
  return items.map(item => {
    let row = cache.get(item);
    if (row === undefined) cache.set(item, (row = build(item)));
    return row;
  });
}
