/**
 * `useTableStickyColumns` that pins only while the table scrolls sideways.
 *
 * Astryx's table scroller is a scroll container only while its table
 * overflows; otherwise it is `overflow: clip`, so a pinned cell sticks to the
 * nearest scroller around it instead: the page's content region, or any
 * clipping box between them. That box's sticky area starts inside its
 * padding, while the table bleeds into the padding (the Table's container
 * bleed), so the pinned column was pushed over its neighbour by the bleed:
 * 24px on a page, which cut the start of the next column on /affiliate.
 * Pinning only while the table overflows keeps the pin inside the table's own
 * scroller, where nothing is pushed, and at widths where the table fits
 * there is nothing to pin anyway.
 */
import {useCallback, useMemo, useRef, useState} from 'react';
import type {Ref} from 'react';
import {useTableStickyColumns} from '@astryxdesign/core/Table';
import type {ScrollWrapperRenderProps, TablePlugin} from '@astryxdesign/core/Table';

function assignRef<E>(ref: Ref<E> | undefined, node: E | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref != null) (ref as {current: E | null}).current = node;
}

export function usePinnedColumns<T extends Record<string, unknown>>(startKeys: string[], endKeys: string[] = []): TablePlugin<T> {
  const [isScrolling, setScrolling] = useState(false);
  const sticky = useTableStickyColumns<T>({startKeys: isScrolling ? startKeys : [], endKeys: isScrolling ? endKeys : []});
  const detach = useRef<(() => void) | null>(null);
  const watch = useCallback((scroller: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!scroller) return;
    const table = scroller.querySelector('table');
    const update = () => setScrolling(!!table && table.offsetWidth > scroller.clientWidth + 1);
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (table) observer.observe(table);
    detach.current = () => observer.disconnect();
  }, []);
  return useMemo(
    (): TablePlugin<T> => ({
      ...sticky,
      transformScrollWrapper(props: ScrollWrapperRenderProps): ScrollWrapperRenderProps {
        // The stock wrapper transform only installs scroll-shadow tracking; retain cell pinning without it.
        const inner = props.htmlProps.ref;
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            ref: (node: HTMLDivElement | null) => {
              watch(node);
              assignRef(inner, node);
            }
          }
        };
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Recreate the plugin when pinning changes so cells re-render.
    [sticky, watch, isScrolling]
  );
}
