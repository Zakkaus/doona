import {DeferredLoading} from './DeferredLoading';
import {useT} from '../../i18n';
import {Badge, Bar, Card, columns, Empty, ErrorMessage, Link, Segmented, TextTooltip} from '../../ui/ui';
import type {useRankingCard} from './useRankingCard';

export function RankingCard({model}: {model: ReturnType<typeof useRankingCard>}) {
  const t = useT();
  const {ref, by, setBy, rows, state, error, retry, truncated} = model;
  return (
    <Card ref={ref}>
      <div className="rp-row">
        <TextTooltip text={t('act.rankingScope')}>
          <h2 className="rp-h3">{t('act.topDevices')}</h2>
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
          <DeferredLoading>{t('ui.loading')}</DeferredLoading>
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
        <div className="rp-list rp-columns" style={columns(rows.length)}>
          {rows.map(row => (
            <Bar
              key={row.name}
              label={
                <Link appearance="link" href={row.href}>
                  <TextTooltip>{row.name}</TextTooltip>
                </Link>
              }
              value={row.value}
              pct={row.pct}
              color={row.color}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
