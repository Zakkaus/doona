import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useLang, useT} from '../../../i18n';
import {useContentWidth} from '../../../ui/ui';
import {treeIndex, treeReach, type RoutingTree} from './map';
import {TREE_STEP, treeGeometry, treeWindow} from './view';

export function useTree(tree: RoutingTree, pinned: string | null, onPin: (id: string | null) => void) {
  const t = useT();
  const lang = useLang();
  const [limit, setLimit] = useState(TREE_STEP);
  const [hovered, setHovered] = useState<string | null>(null);
  const [ref, measured] = useContentWidth<HTMLDivElement>();
  const index = useMemo(() => treeIndex(tree), [tree]);
  const shown = useMemo(() => treeWindow(tree, limit), [tree, limit]);
  const geometry = useMemo(() => treeGeometry(shown, measured, t, lang), [shown, measured, t, lang]);
  // A tile that leaves under the pointer never reports the hover's end, so only a tile still drawn counts as hovered.
  const drawn = useMemo(() => new Set(geometry.placed.map(tile => tile.view.id)), [geometry.placed]);
  const known = useMemo(() => new Set([...tree.leaves, ...tree.outbounds, ...tree.nodes].map(item => item.id)), [tree]);
  const focus = hovered && drawn.has(hovered) ? hovered : pinned && known.has(pinned) ? pinned : null;
  const active = useMemo(() => (focus ? treeReach(index, focus) : null), [index, focus]);
  useEffect(() => {
    if (!pinned) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPin(null);
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [pinned, onPin]);
  // Read at press time, so one `pin` serves every tile across pin changes.
  const current = useRef(pinned);
  useLayoutEffect(() => {
    current.current = pinned;
  }, [pinned]);
  const pin = useCallback((id: string) => onPin(current.current === id ? null : id), [onPin]);
  return {
    ...geometry,
    ref,
    ready: geometry.width !== undefined,
    active,
    pinned,
    pin,
    hover: setHovered,
    more: tree.leaves.length > limit ? t('flow.treeShowMore', {n: Math.min(TREE_STEP, tree.leaves.length - limit)}) : null,
    fewer: limit > TREE_STEP ? t('flow.treeFewer', {n: TREE_STEP}) : null,
    showMore: () => setLimit(value => Math.min(tree.leaves.length, value + TREE_STEP)),
    showFewer: () => setLimit(TREE_STEP)
  };
}
