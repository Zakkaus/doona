import {createContext, useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject} from 'react';
import {packSection} from './packing';

// A section packs as it mounts, before its first paint, and keeps packing until it unmounts.
export function usePacking(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const section = ref.current;
    return section ? packSection(section) : undefined;
  }, [ref]);
}

// A dashboard card's cell. Its data attributes are the section's whole layout input, so the editor's cells, which
// carry the same attributes, keep every box the page has. `width` is a fraction the reader chose, absent for the
// profile's footprint; `height` is the card's height step.
export type TileProps = {id: string; module: string; size: string; foot?: string; width?: string; height?: string};
export const tileAttributes = ({id, module, size, foot, width, height}: TileProps) => ({
  'data-instance': id,
  'data-module': module,
  'data-size': size,
  'data-foot': foot,
  'data-width': width,
  'data-height': height
});
// A section with a chosen width lays every card on the fraction grid from tablet width up (see dashboard.css).
export const sectionGrid = (tiles: readonly TileProps[]) => (tiles.some(tile => tile.width) ? 'fraction' : undefined);

// Whether a card is two thirds of its row or wider by the box packing last measured (data-wide, see packSection), so an
// Auto card's renderer draws the statistics its footprint has room for, and only then.
export const WideCell = createContext(false);
// A ref for the cell, or for an element inside it (`cellOf`), and whether that cell is marked wide.
function useWideMark(cellOf: (node: HTMLElement) => Element | null = node => node) {
  const [wide, setWide] = useState(false);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      const cell = node && cellOf(node);
      if (!cell) return;
      const read = () => setWide(cell.hasAttribute('data-wide'));
      read();
      const watch = new MutationObserver(read);
      watch.observe(cell, {attributes: true, attributeFilter: ['data-wide']});
      return () => watch.disconnect();
    },
    [cellOf]
  );
  return [ref, wide] as const;
}

export function DashboardTile({tile, visible, targetRef, children}: {tile: TileProps; visible: boolean; targetRef: Ref<HTMLDivElement>; children: ReactNode}) {
  const [mark, wide] = useWideMark();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      const unmark = mark(node);
      if (typeof targetRef !== 'function') {
        if (targetRef) targetRef.current = node;
        return unmark;
      }
      const release = targetRef(node);
      return () => {
        unmark?.();
        if (typeof release === 'function') release();
      };
    },
    [mark, targetRef]
  );
  return (
    <div ref={ref} className="rp-dashboard-cell" data-visible={visible} {...tileAttributes(tile)}>
      <WideCell value={wide}>{children}</WideCell>
    </div>
  );
}
const parentCell = (node: HTMLElement) => node.closest('.rp-dashboard-cell');
// The editor's card body, inert, with its cell's wide mark.
export function DashboardBody({children}: {children: ReactNode}) {
  const [ref, wide] = useWideMark(parentCell);
  return (
    <div ref={ref} className="rp-dashboard-body" inert>
      <WideCell value={wide}>{children}</WideCell>
    </div>
  );
}
// A dashboard section: its profile or the fraction grid sets the columns and spans, and packing stacks shorter cards
// beside a tall one.
export function DashboardSection({profile, grid, children}: {profile: string; grid?: string; children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);
  usePacking(ref);
  return (
    <div ref={ref} className="rp-dash-section" data-profile={profile} data-grid={grid}>
      {children}
    </div>
  );
}
