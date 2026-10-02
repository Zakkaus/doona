import type {ReactNode} from 'react';
import {useT} from '../../i18n';
import type {ResourceState} from '../../store/resourceCore';
import {ErrorMessage, Loading} from '../../ui/ui';

export function Reading<T>({state, children}: {state: ResourceState<T> & {refetch: () => unknown}; children: ReactNode}) {
  const t = useT();
  return (
    <>
      <ErrorMessage error={state.error} onRetry={state.refetch} />
      {state.error && state.data && <span className="rp-label">{t('widgets.stale')}</span>}
      {state.loading && !state.data ? <Loading /> : children}
    </>
  );
}
