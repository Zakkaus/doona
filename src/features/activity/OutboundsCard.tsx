import {useMemo} from 'react';
import {useCapabilities, useRuntimeOutbounds} from '../../store';
import {LOCALE, useLang, useT} from '../../i18n';
import {Donut, usePalette} from '../../ui/Charts';
import {Empty, ErrorMessage, Loading} from '../../ui/ui';
import {activityOutbounds} from './view';

// Outbound usage polls on its own, so its tick does not re-render the charts beside it.
export function OutboundsCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const capabilities = useCapabilities();
  const available = capabilities.data?.resources.runtime_outbounds.available;
  const outbounds = useRuntimeOutbounds(available === true);
  const view = useMemo(() => activityOutbounds(outbounds.data, locale, p, t), [outbounds.data, locale, p, t]);
  const state = available === false ? 'unavailable' : !outbounds.data ? 'loading' : !view.rows.length ? 'empty' : 'ready';
  return (
    <div className="rp-card">
      <div className="rp-row">
        <div className="rp-cluster">
          <h3 className="rp-h3">{t('act.outUsage')}</h3>
          {view.since && <span className="rp-label">{view.since}</span>}
        </div>
      </div>
      {outbounds.error ? (
        <ErrorMessage error={outbounds.error} />
      ) : state === 'unavailable' ? (
        <span className="rp-label">{t('act.noOutbounds')}</span>
      ) : state === 'loading' ? (
        <Loading>{t('act.loading')}</Loading>
      ) : state === 'empty' ? (
        <Empty>{t('ui.empty')}</Empty>
      ) : (
        <Donut rows={view.rows} total={view.total} />
      )}
    </div>
  );
}
