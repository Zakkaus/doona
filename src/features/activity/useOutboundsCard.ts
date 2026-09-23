import {useMemo} from 'react';
import {useCapabilities, useRuntimeOutbounds} from '../../store';
import {LOCALE, useLang, useT} from '../../i18n';
import {usePalette} from '../../ui/Charts';
import {activityOutbounds} from './view';

export function useOutboundsCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const available = useCapabilities().data?.resources.runtime_outbounds.available;
  const outbounds = useRuntimeOutbounds(available === true);
  const view = useMemo(() => activityOutbounds(outbounds.data, locale, p, t), [outbounds.data, locale, p, t]);
  const state = available === false ? 'unavailable' : !outbounds.data ? 'loading' : !view.rows.length ? 'empty' : 'ready';
  return {view, state, error: outbounds.error};
}
