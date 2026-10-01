import {useContext, type ReactNode} from 'react';
import {ResourcePreview} from '../../store/preview';
import {Loading} from '../../ui/ui';
export function DeferredLoading({children}: {children?: ReactNode}) {
  return useContext(ResourcePreview) ? <span aria-hidden="true">—</span> : <Loading>{children}</Loading>;
}
