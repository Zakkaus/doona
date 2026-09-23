import {useT} from '../../i18n';
import {Donut} from '../../ui/charts';
import {Empty, ErrorMessage, Loading} from '../../ui/ui';
import {useOutboundsCard} from './useOutboundsCard';

// Outbound usage polls on its own, so its tick does not re-render the charts beside it.
export function OutboundsCard() {
  const t = useT();
  const {view, state, error, retry} = useOutboundsCard();
  return (
    <div className="rp-card">
      <div className="rp-row">
        <div className="rp-cluster">
          <h3 className="rp-h3">{t('act.outUsage')}</h3>
          {view.since && <span className="rp-label">{view.since}</span>}
        </div>
      </div>
      {error && state !== 'ready' ? (
        <ErrorMessage error={error} onRetry={retry} />
      ) : state === 'unavailable' ? (
        <div className="rp-chart-wait tall">
          <Empty>{t('act.noOutbounds')}</Empty>
        </div>
      ) : state === 'loading' ? (
        <div className="rp-chart-wait tall">
          <Loading>{t('act.loading')}</Loading>
        </div>
      ) : state === 'empty' ? (
        <div className="rp-chart-wait tall">
          <Empty>{t('ui.empty')}</Empty>
        </div>
      ) : (
        <Donut label={t('act.outUsage')} rows={view.rows} total={view.total} />
      )}
    </div>
  );
}
