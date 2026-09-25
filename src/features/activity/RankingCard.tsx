import {useT} from '../../i18n';
import {Badge, Bar, Card, Empty, ErrorMessage, Loading, Segmented, TextTooltip} from '../../ui/ui';
import {useRankingCard} from './useRankingCard';

// Top clients owns its own connections subscription: a 20-second poll over up to 1,000 connections
// re-renders this card alone, not the traffic charts or the tiles beside it.
export function RankingCard() {
  const t = useT();
  const {ref, by, setBy, rows, state, error, retry, truncated} = useRankingCard();
  return (
    <Card ref={ref}>
      <div className="rp-row">
        <TextTooltip text={t('act.rankingScope')}>
          <h3 className="rp-h3">{t('act.topDevices')}</h3>
        </TextTooltip>
        <Segmented
          label={t('act.topDevices')}
          value={by}
          onChange={setBy}
          items={[
            ['dev', t('act.devices')],
            ['host', t('act.domains')]
          ]}
        />
      </div>
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {truncated && (
        <TextTooltip text={t('act.rankingTruncated')}>
          <Badge tone="warn">{t('act.truncated')}</Badge>
        </TextTooltip>
      )}
      {state === 'error' ? null : state === 'loading' ? (
        <div className="rp-chart-wait bars">
          <Loading>{t('ui.loading')}</Loading>
        </div>
      ) : state === 'unavailable' ? (
        <div className="rp-chart-wait bars">
          <Empty>{t('act.noConnections')}</Empty>
        </div>
      ) : state === 'empty' ? (
        <div className="rp-chart-wait bars">
          <Empty>{t('act.rankingEmpty')}</Empty>
        </div>
      ) : (
        <div className="rp-list">
          {rows.map(row => (
            <Bar key={row.name} label={row.name} value={row.value} pct={row.pct} color={row.color} />
          ))}
        </div>
      )}
    </Card>
  );
}
