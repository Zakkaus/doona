import {VStack} from '@astryxdesign/core/Stack';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {useMessages} from '../i18n';
import {EASE, MOTION} from './motion/tokens';
import {cancelOnReducedMotion, prefersReducedMotion} from './motion/useReducedMotion';

export function CollectionLoading({
  loading,
  name,
  children,
  prepared = true
}: {
  loading: boolean;
  name: string;
  children: ReactNode | ((showPlaceholder: boolean) => ReactNode);
  prepared?: boolean;
}) {
  const t = useMessages();
  const [delayed, setDelayed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (!loading) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), 200);
    return () => clearTimeout(timer);
  }, [loading]);
  useLayoutEffect(() => {
    const swap = wasLoading.current && !loading;
    wasLoading.current = loading;
    if (!swap || !root.current || prefersReducedMotion()) return;
    return cancelOnReducedMotion([
      root.current.animate([{opacity: 0}, {opacity: 1}], {
        id: 'collection-ready',
        duration: MOTION.swapDuration,
        easing: EASE
      })
    ]);
  }, [loading]);
  return (
    <VStack
      ref={root}
      gap={0}
      data-collection
      data-placeholder={loading ? '' : undefined}
      data-loading-shape={loading && delayed && prepared ? name : undefined}
      inert={loading}
      aria-busy={loading}
      role={loading ? 'status' : undefined}
      aria-label={loading ? t.loading : undefined}
      style={{visibility: loading && (!delayed || !prepared) ? 'hidden' : undefined, opacity: loading && (!delayed || !prepared) ? 0 : undefined}}
    >
      {typeof children === 'function' ? children(loading && delayed && prepared) : children}
    </VStack>
  );
}

export function RowPlaceholder({lines = 1, supporting = false, width}: {lines?: number; supporting?: boolean; width?: string}) {
  return (
    <VStack gap={1} aria-hidden="true" style={{width: width ?? (supporting ? '10ch' : '16ch'), maxWidth: '100%'}}>
      {Array.from({length: lines}, (_, i) => (
        <VStack
          key={i}
          style={{
            height: supporting
              ? 'calc(var(--text-supporting-leading) * var(--text-supporting-size))'
              : 'calc(var(--text-body-leading) * var(--text-body-size))',
            justifyContent: 'center'
          }}
        >
          <Skeleton height={supporting ? 'var(--text-supporting-size)' : 'var(--text-body-size)'} width={i ? '60%' : '100%'} />
        </VStack>
      ))}
    </VStack>
  );
}
