import type {ReactNode} from 'react';
import {useT} from '../../i18n';
import type {ResourceState} from '../../store/resourceCore';
import {ErrorMessage, SkeletonBar, SkeletonGroup} from '../../ui/ui';

// A widget's first read draws its readings as Skeleton lines, `rows` of them, and its chart's block when it has one.
export function Reading<T>({
  state,
  rows = 2,
  chart,
  children
}: {
  state: ResourceState<T> & {refetch: () => unknown};
  rows?: number;
  chart?: number;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <>
      <ErrorMessage error={state.error} onRetry={state.refetch} />
      {state.error && state.data && <span className="rp-label">{t('widgets.stale')}</span>}
      {state.loading && !state.data ? (
        <SkeletonGroup>
          {Array.from({length: rows}, (_, i) => (
            <SkeletonBar key={i} line="body" />
          ))}
          {chart && <SkeletonBar height={chart} />}
        </SkeletonGroup>
      ) : (
        children
      )}
    </>
  );
}
