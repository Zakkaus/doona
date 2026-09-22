import {useCallback, useEffect, useMemo, useState} from 'react';
import {useT} from '../../i18n';
import {useContentWidth} from '../../ui/ui';
import {treeIndex, treeReach, type RoutingTree} from './map';
import {TREE_STEP, treeGeometry, treeWindow} from './view';

export function useTree(tree: RoutingTree, pinned: string | null, onPin: (id: string | null) => void) {
  const t = useT();
  const [limit, setLimit] = useState(TREE_STEP);
  const [hovered, setHovered] = useState<string | null>(null);
  const [ref, measured] = useContentWidth<HTMLDivElement>();
  const focus = hovered ?? pinned;
  const index = useMemo(() => treeIndex(tree), [tree]);
  const active = useMemo(() => (focus ? treeReach(index, focus) : null), [index, focus]);
  const shown = useMemo(() => treeWindow(tree, limit), [tree, limit]);
  const geometry = useMemo(() => treeGeometry(shown, measured, t), [shown, measured, t]);
  useEffect(() => {
    if (!pinned) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPin(null);
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [pinned, onPin]);
  const pin = useCallback((id: string) => onPin(pinned === id ? null : id), [pinned, onPin]);
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
