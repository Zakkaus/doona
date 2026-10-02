import {useLayoutEffect, useRef, type ReactNode, type Ref, type RefObject} from 'react';
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

export function DashboardTile({tile, visible, targetRef, children}: {tile: TileProps; visible: boolean; targetRef: Ref<HTMLDivElement>; children: ReactNode}) {
  return (
    <div ref={targetRef} className="rp-dashboard-cell" data-visible={visible} {...tileAttributes(tile)}>
      {children}
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
