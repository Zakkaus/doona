import {DeferredChart} from './DeferredLoading';
import {useT} from '../../i18n';
import {Donut} from '../../ui/charts';
import {Card, Empty, ErrorMessage, ChartWait} from '../../ui/ui';
import {useOutboundsCard} from './useOutboundsCard';

// Outbound usage polls on its own, so its tick does not re-render the charts beside it.
export function OutboundsCard() {
  const t = useT();
  const {view, state, error, retry} = useOutboundsCard();
  return (
    <Card>
      <div className="rp-row">
        <div className="rp-cluster">
          <h2 className="rp-h3">{t('act.outUsage')}</h2>
          {view.since && <span className="rp-label rp-counter-since">{view.since}</span>}
        </div>
      </div>
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {error && state !== 'ready' ? null : state === 'unavailable' ? (
        <ChartWait holds="tall">
          <Empty>{t('act.noOutbounds')}</Empty>
        </ChartWait>
      ) : state === 'loading' ? (
        // The donut's box.
        <DeferredChart parts={[{height: 136}]} />
      ) : state === 'empty' ? (
        <ChartWait holds="tall">
          <Empty>{t('ui.empty')}</Empty>
        </ChartWait>
      ) : (
        <Donut label={t('act.outUsage')} rows={view.rows} total={view.total} />
      )}
    </Card>
  );
}
