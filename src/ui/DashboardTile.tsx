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
// carry the same attributes, keep every box the page has.
export type TileProps = {id: string; module: string; size: string; foot?: string};
export const tileAttributes = ({id, module, size, foot}: TileProps) => ({'data-instance': id, 'data-module': module, 'data-size': size, 'data-foot': foot});

export function DashboardTile({tile, visible, targetRef, children}: {tile: TileProps; visible: boolean; targetRef: Ref<HTMLDivElement>; children: ReactNode}) {
  return (
    <div ref={targetRef} className="rp-dashboard-cell" data-visible={visible} {...tileAttributes(tile)}>
      {children}
    </div>
  );
}
// A dashboard section: its profile sets the columns and spans, and packing stacks shorter cards beside a tall one.
export function DashboardSection({profile, children}: {profile: string; children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);
  usePacking(ref);
  return (
    <div ref={ref} className="rp-dash-section" data-profile={profile}>
      {children}
    </div>
  );
}
